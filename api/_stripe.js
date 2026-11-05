// Talking to Stripe without the SDK (Update 166): form-encoded REST calls and
// webhook signature checks with Node's crypto. Keeps the bundle small and
// there's nothing to install.
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET
import crypto from 'node:crypto'

// { a: 1, line_items: [{ price: 'x' }] } -> "a=1&line_items[0][price]=x"
export function formEncode(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') out.push(formEncode(v, key))
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return out.filter(Boolean).join('&')
}

export async function stripe(path, { method = 'POST', body, fetchFn = globalThis.fetch } = {}) {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim()
  if (!key) throw Object.assign(new Error('Payments are not set up yet (STRIPE_SECRET_KEY missing).'), { status: 400 })
  const r = await fetchFn(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
    body: method === 'GET' ? undefined : formEncode(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Stripe error ${r.status}`), { status: 502 })
  return j
}

// Stripe-Signature: t=<unix>,v1=<hex hmac of "t.rawBody">[,v1=...]
export function verifyStripeSignature(rawBody, header, secret, { tolerance = 300, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!secret) return { ok: false, error: 'STRIPE_WEBHOOK_SECRET missing' }
  const parts = String(header || '').split(',').map(p => p.trim().split('='))
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length) return { ok: false, error: 'Bad signature header' }
  if (Math.abs(now - t) > tolerance) return { ok: false, error: 'Signature too old' }
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  const exp = Buffer.from(expected, 'hex')
  const match = sigs.some(s => { const b = Buffer.from(String(s), 'hex'); return b.length === exp.length && crypto.timingSafeEqual(b, exp) })
  return match ? { ok: true } : { ok: false, error: 'Signature mismatch' }
}

// The exact bytes Stripe sent (needed for the signature). Vercel only parses
// req.body when it's read, so the stream is still there. Never touch req.body
// here: reading it would make Vercel consume the stream and parse it.
export async function rawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody
  const chunks = []
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks).toString('utf8')
}

// Stripe subscription status -> what the app does with it
export function groupStatusFrom(subStatus) {
  if (subStatus === 'active' || subStatus === 'trialing') return 'active'
  if (subStatus === 'past_due') return 'past_due'
  if (subStatus === 'incomplete') return 'pending'
  return 'canceled' // canceled, unpaid, incomplete_expired, paused
}

// Where to send people back to: APP_URL if set, else the host they came from.
export function appUrl(req) {
  const env = String(process.env.APP_URL || '').trim().replace(/\/$/, '')
  if (env) return env
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'workhorse-strong.vercel.app'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}
