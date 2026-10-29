// Steps from an iPhone Shortcut (Update 143).
//   POST /api/steps?t=<client's private token>
//   body: { "steps": 8532, "date": "2026-10-28" }   (date optional, defaults to today Eastern)
// Shortcuts sometimes sends numbers as text ("8,532" or "8532.0"), so both are accepted.
// The token is the only credential: it identifies one client and can only write
// their step count. Rotating it on the setup page kills the old link.
import { admin } from './_push.js'

const TZ = process.env.COACH_TIMEZONE || 'America/New_York'
const dayIn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export function parseSteps(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null
  const m = String(v ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/)
  return m ? Math.round(Number(m[0])) : null
}

// Accept yyyy-MM-dd, or anything Date can read; only today or the 3 days before.
export function pickDate(raw, now = new Date()) {
  const today = dayIn(now)
  if (!raw) return today
  let d = String(raw).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { const p = new Date(d.replace(/\s+at\s+/i, ' ')); if (isNaN(p)) return null; d = dayIn(p) }
  const diff = (Date.parse(today) - Date.parse(d)) / 864e5
  return diff >= 0 && diff <= 3 ? d : null
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const token = String(req.query?.t || req.headers['x-steps-token'] || '').trim()
  if (!/^[a-f0-9]{24,64}$/.test(token)) return res.status(401).json({ error: 'Missing or bad link. Copy your link again from the app.' })
  let body = req.body || {}
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = { steps: body } } }
  const steps = parseSteps(body.steps ?? body.Steps ?? body.value)
  if (steps === null || steps < 0 || steps > 150000) return res.status(400).json({ error: 'No step count found.' })
  const date = pickDate(body.date)
  if (!date) return res.status(400).json({ error: 'Date must be today or up to 3 days ago.' })
  try {
    const sb = admin()
    const { data: who } = await sb.from('profiles').select('id, full_name, role').eq('steps_token', token).maybeSingle()
    if (!who || who.role !== 'client') return res.status(401).json({ error: 'This link is no longer active. Copy your new link from the app.' })
    const { error } = await sb.from('daily_logs').upsert(
      { client_id: who.id, log_date: date, steps, steps_source: 'shortcut', steps_synced_at: new Date().toISOString() },
      { onConflict: 'client_id,log_date' })
    if (error) return res.status(500).json({ error: error.message })
    res.json({ ok: true, date, steps, message: `Saved ${steps.toLocaleString('en-US')} steps for ${date}.` })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
