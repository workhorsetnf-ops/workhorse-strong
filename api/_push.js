// Shared server helpers for push notifications. Files starting with "_" are not
// exposed as endpoints by Vercel.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   VITE_VAPID_PUBLIC_KEY   public key (also used by the app to subscribe)
//   VAPID_PRIVATE_KEY       private key: keep secret
//   VAPID_SUBJECT           mailto: address push services can contact, e.g. mailto:anthony@beaworkhorse.com
//   SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL  (already set)
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

export function admin() {
  const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

let ready = false
export function setupPush() {
  if (ready) return
  const { VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VITE_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('Missing VITE_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY')
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:anthony@beaworkhorse.com', VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  ready = true
}

// Send one message to every device a set of users has. Dead devices (uninstalled,
// permission revoked) are removed so they're never tried again.
export async function sendToUsers(sb, userIds, msg) {
  setupPush()
  const ids = [...new Set(userIds)].filter(Boolean)
  if (!ids.length) return { sent: 0, removed: 0, failed: 0 }
  const { data: subs } = await sb.from('push_subscriptions').select('*').in('user_id', ids)
  let sent = 0, removed = 0, failed = 0
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || '/', tag: msg.tag })
  await Promise.all((subs || []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 6 })
      sent++
      await sb.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id)
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await sb.from('push_subscriptions').delete().eq('id', s.id); removed++ }
      else failed++
    }
  }))
  return { sent, removed, failed }
}

// The signed-in user making the request (from the app's session token).
export async function userFromReq(sb, req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return null
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) return null
  const { data: prof } = await sb.from('profiles').select('id, role, full_name').eq('id', data.user.id).single()
  return prof || null
}

export async function prefsFor(sb, ids) {
  const { data } = await sb.from('reminder_prefs').select('*').in('user_id', ids)
  return Object.fromEntries((data || []).map(p => [p.user_id, p]))
}

export function localDateIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
