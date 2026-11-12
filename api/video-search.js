// Find exercise demo videos on YouTube (Update 163). Coach only.
//   POST { q }  ->  { results: [{ id, url, title, channel, thumb, seconds }], query }
// Short demos first: anything under a minute is ranked ahead, then under four.
// Env: YOUTUBE_API_KEY (YouTube Data API v3). Each search uses ~101 of the
// free 10,000 daily quota units, so roughly 95 searches a day.
import { admin, userFromReq } from './_push.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me || me.role !== 'coach') return res.status(403).json({ error: 'Coach only' })
    if (me.actor) return res.status(403).json({ error: 'View only: assistants can’t change the library.' })
    return await runVideoSearch(req.body || {}, res)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

export async function runVideoSearch(body, res, fetchFn = globalThis.fetch) {
  const key = String(process.env.YOUTUBE_API_KEY || '').trim()
  if (!key) return res.status(400).json({ error: 'Video search is not set up yet. Add YOUTUBE_API_KEY in Vercel → Settings → Environment Variables, then redeploy.' })
  const name = String(body.q || '').trim().slice(0, 120)
  if (!name) return res.status(400).json({ error: 'Missing exercise name' })
  const query = searchQuery(name)

  const s = new URL('https://www.googleapis.com/youtube/v3/search')
  Object.entries({ part: 'snippet', type: 'video', q: query, maxResults: '12', videoDuration: 'short', safeSearch: 'strict', relevanceLanguage: 'en', videoEmbeddable: 'true', key })
    .forEach(([k, v]) => s.searchParams.set(k, v))
  const sr = await fetchFn(s.toString())
  const sj = await sr.json().catch(() => ({}))
  if (!sr.ok) return res.status(502).json({ error: ytError(sj, sr.status) })
  const ids = (sj.items || []).map(i => i.id?.videoId).filter(Boolean)
  if (!ids.length) return res.json({ results: [], query })

  const v = new URL('https://www.googleapis.com/youtube/v3/videos')
  Object.entries({ part: 'contentDetails,snippet', id: ids.join(','), key }).forEach(([k, val]) => v.searchParams.set(k, val))
  const vr = await fetchFn(v.toString())
  const vj = await vr.json().catch(() => ({}))
  if (!vr.ok) return res.status(502).json({ error: ytError(vj, vr.status) })
  return res.json({ results: rankVideos(ids, vj.items || []).slice(0, 4), query })
}

// "DB bench" → "DB bench exercise form demo"; leave alone if it already says form/how to.
export function searchQuery(name) {
  return /\b(form|how to|tutorial|demo)\b/i.test(name) ? name : `${name} exercise form demo`
}

// ISO 8601 duration ("PT1M5S") → seconds
export function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(d || ''))
  if (!m) return null
  const [, D, H, M, S] = m.map(x => Number(x) || 0)
  return D * 86400 + H * 3600 + M * 60 + S
}

// Keep YouTube's relevance order inside each bucket: under 60 s, then the rest.
// Drops live streams / premieres (no duration) and anything 4 minutes or longer.
export function rankVideos(order, items) {
  const byId = new Map(items.map(i => [i.id, i]))
  const rows = order.map((id, rank) => {
    const it = byId.get(id)
    if (!it) return null
    const seconds = isoSeconds(it.contentDetails?.duration)
    if (!seconds || seconds >= 240) return null
    const sn = it.snippet || {}
    return {
      id, rank, seconds,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: decode(sn.title || ''), channel: decode(sn.channelTitle || ''),
      thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    }
  }).filter(Boolean)
  return rows.sort((a, b) => (a.seconds < 60 ? 0 : 1) - (b.seconds < 60 ? 0 : 1) || a.rank - b.rank)
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

function ytError(j, status) {
  const reason = j?.error?.errors?.[0]?.reason || ''
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') return 'YouTube daily search limit reached (about 95 searches a day). It resets at midnight Pacific time.'
  if (reason === 'keyInvalid' || status === 400 && /API key/i.test(j?.error?.message || '')) return 'The YouTube API key is not valid. Check YOUTUBE_API_KEY in Vercel.'
  if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(j?.error?.message || '')) return 'YouTube Data API v3 is not turned on for this key. Enable it in Google Cloud, then try again.'
  return `YouTube search failed: ${j?.error?.message || `status ${status}`}`
}
