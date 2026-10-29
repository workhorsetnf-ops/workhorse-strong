// Snap-a-photo food logging (Update 150). Any signed-in user.
//   POST { image: <base64 JPEG, no prefix>, note?: string }
//   -> { items: [{ name, grams, per100: {kcal,p,c,f,fiber} }], confidence, warning, left }
// Nothing is saved here; the client confirms and edits before logging.
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional).
import { admin, userFromReq } from './_push.js'
import { photoPrompt, parsePhotoAi, DAILY_PHOTO_LIMIT } from '../src/lib/photoFood.js'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
const TZ = process.env.COACH_TIMEZONE || 'America/New_York'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me) return res.status(401).json({ error: 'Sign in again and retry.' })
    return await runFoodPhoto(sb, me, req.body || {}, res, globalThis.fetch)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

export async function runFoodPhoto(sb, me, body, res, fetchFn) {
  const image = String(body.image || '').replace(/^data:image\/\w+;base64,/, '')
  if (image.length < 1000) return res.status(400).json({ error: 'No photo received. Try again.' })
  if (image.length > 5_500_000) return res.status(413).json({ error: 'That photo is too large. Try again (the app shrinks it automatically).' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Photo logging isn’t switched on yet. Ask your coach.' })

  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const { data: use } = await sb.from('ai_usage').select('count').eq('user_id', me.id).eq('kind', 'food_photo').eq('day', day).maybeSingle()
  const used = use?.count || 0
  if (used >= DAILY_PHOTO_LIMIT) return res.status(429).json({ error: `That’s ${DAILY_PHOTO_LIMIT} photos today, the daily limit. Search or scan for the rest.` })

  const { system, user } = photoPrompt(String(body.note || ''))
  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 900, system,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: user }] }],
    }),
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) return res.status(502).json({ error: `Couldn’t read the photo: ${out?.error?.message || r.status}` })
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
  const result = parsePhotoAi(text)
  await sb.from('ai_usage').upsert({ user_id: me.id, kind: 'food_photo', day, count: used + 1 }, { onConflict: 'user_id,kind,day' })
  return res.json({ ...result, left: DAILY_PHOTO_LIMIT - used - 1 })
}
