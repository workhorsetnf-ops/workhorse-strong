// Hands-free onboarding for new 1:1 clients (Update 184).
// A payment from an email the app doesn't know -> account, contract, forms,
// setup link, Kit "set up your account" email. Signing the contract -> Kit
// welcome email. Nothing here runs for someone who already has an account
// (renewals, group members, returning clients), so it can't double-send.
import crypto from 'node:crypto'
import { createClientAccount } from './_accounts.js'
import { kitReady, kitSubscribeToSequence, firstNameOf } from './_kit.js'

export const TOKEN_DAYS = 14
const DAY = 864e5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const hashToken = t => crypto.createHash('sha256').update(String(t || '')).digest('hex')
export const newToken = () => crypto.randomBytes(24).toString('base64url')
export const appBase = () => String(process.env.APP_URL || 'https://workhorse-strong.vercel.app').trim().replace(/\/$/, '')

export function resolveContract(body, name, now = new Date()) {
  return String(body || '')
    .replaceAll('{{client_name}}', name || '')
    .replaceAll('{{date}}', now.toLocaleDateString('en-US', { timeZone: 'America/New_York' }))
}

export async function onboardingSettings(sb) {
  const { data } = await sb.from('onboarding_settings').select('*').eq('id', 1).maybeSingle()
  return data || { enabled: false, form_ids: [] }
}

// A fresh one-time link to /welcome/<token>. Older unused links stop working.
export async function issueSetupLink(sb, clientId, now = new Date()) {
  const token = newToken()
  await sb.from('onboarding_tokens').delete().eq('client_id', clientId).is('used_at', null)
  const { error } = await sb.from('onboarding_tokens').insert({ token_hash: hashToken(token), client_id: clientId, expires_at: new Date(now.getTime() + TOKEN_DAYS * DAY).toISOString() })
  if (error) throw error
  return `${appBase()}/welcome/${token}`
}

// The token row if it's live, else null.
export async function liveToken(sb, token, now = new Date()) {
  if (!token) return null
  const { data } = await sb.from('onboarding_tokens').select('*').eq('token_hash', hashToken(token)).maybeSingle()
  if (!data || data.used_at || new Date(data.expires_at) <= now) return null
  return data
}

export async function onboardFromPayment(sb, { email, name, source }, deps = {}) {
  const settings = await onboardingSettings(sb)
  if (!settings.enabled && !deps.manual) return { skipped: 'onboarding is off' }   // the coach's own button works either way
  const mail = String(email || '').trim().toLowerCase()
  if (!EMAIL.test(mail)) return { skipped: 'no email on the payment' }
  const { data: existing } = await sb.from('profiles').select('id').eq('email', mail).limit(1).maybeSingle()
  if (existing) return { skipped: 'already has an account' }

  const fullName = String(name || '').trim() || mail.split('@')[0]
  const password = crypto.randomBytes(18).toString('base64url')   // never shown; they pick their own on the setup page
  const r = await (deps.createAccount || createClientAccount)(sb, { name: fullName, mail, password })
  if (r.error) return r.status === 409 ? { skipped: 'already has an account' } : { error: r.error }
  const id = r.user.id
  const now = deps.now || new Date()

  await sb.from('profiles').update({ status: 'active', onboarding_started_at: now.toISOString(), onboarding_source: source || null }).eq('id', id)

  if (settings.contract_template_id) {
    const { data: tpl } = await sb.from('contract_templates').select('*').eq('id', settings.contract_template_id).maybeSingle()
    if (tpl) await sb.from('contracts').insert({ template_id: tpl.id, client_id: id, title: tpl.name, body: resolveContract(tpl.body, fullName, now), status: 'sent' })
  }
  const forms = settings.form_ids || []
  if (forms.length) await sb.from('standalone_form_assignments').insert(forms.map(form_id => ({ client_id: id, form_id, status: 'pending' })))

  const link = await issueSetupLink(sb, id, now)
  let kitError = null
  if (settings.kit_setup_sequence_id && (deps.kitReady || kitReady)()) {
    try {
      await (deps.subscribe || kitSubscribeToSequence)({ email: mail, firstName: firstNameOf(fullName), fields: { setup_link: link }, sequenceId: settings.kit_setup_sequence_id }, deps)
    } catch (e) { kitError = e.message }
  } else kitError = 'Kit setup email isn’t configured'
  await (deps.notify || (() => {}))({
    title: 'New client paid',
    body: kitError ? `${fullName}: account made, but the setup email didn’t send (${kitError}). Copy their link from Contracts.` : `${fullName}: account made, setup email sent.`,
    url: '/coach/contracts',
  })
  return { onboarded: id, link, ...(kitError ? { kitError } : {}) }
}

// Contract signed -> welcome email, exactly once.
export async function sendWelcome(sb, clientId, deps = {}) {
  const { data: p } = await sb.from('profiles').select('id, email, full_name, onboarding_started_at, onboarding_welcome_at').eq('id', clientId).maybeSingle()
  if (!p?.onboarding_started_at) return { skipped: 'not a new client' }
  if (p.onboarding_welcome_at) return { skipped: 'already sent' }
  const { data: cs } = await sb.from('contracts').select('status').eq('client_id', clientId)
  if ((cs || []).some(c => c.status === 'sent')) return { skipped: 'contract not signed yet' }
  const settings = await onboardingSettings(sb)
  if (!settings.kit_welcome_sequence_id || !(deps.kitReady || kitReady)()) return { skipped: 'welcome email isn’t configured' }

  // claim it first so two tabs can't both send
  const stamp = (deps.now || new Date()).toISOString()
  const { data: claimed } = await sb.from('profiles').update({ onboarding_welcome_at: stamp }).eq('id', clientId).is('onboarding_welcome_at', null).select('id')
  if (!claimed?.length) return { skipped: 'already sent' }
  try {
    await (deps.subscribe || kitSubscribeToSequence)({ email: p.email, firstName: firstNameOf(p.full_name), fields: { app_link: `${appBase()}/app` }, sequenceId: settings.kit_welcome_sequence_id }, deps)
  } catch (e) {
    await sb.from('profiles').update({ onboarding_welcome_at: null }).eq('id', clientId)   // try again next time they open the app
    throw e
  }
  return { sent: true }
}
