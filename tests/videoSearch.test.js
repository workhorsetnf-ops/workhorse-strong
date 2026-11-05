// Library "Find videos" (Update 163).
import { test, expect } from 'vitest'
import { runVideoSearch, isoSeconds, rankVideos, searchQuery } from '../api/video-search.js'

const res = () => { const r = { code: 200 }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r }
const vid = (id, dur) => ({ id, contentDetails: { duration: dur }, snippet: { title: `T ${id} &amp; co`, channelTitle: 'Ch', thumbnails: { medium: { url: 'u' } } } })

test('durations and query', () => {
  expect([isoSeconds('PT45S'), isoSeconds('PT1M5S'), isoSeconds('junk')]).toEqual([45, 65, null])
  expect(searchQuery('Cable Lateral Raise')).toBe('Cable Lateral Raise exercise form demo')
})
test('under a minute first, drops live and 4+ min', () => {
  expect(rankVideos(['a', 'b', 'c', 'd', 'e'], [vid('a', 'PT2M'), vid('b', 'PT40S'), vid('c', 'P0D'), vid('d', 'PT55S'), vid('e', 'PT5M')]).map(x => x.id)).toEqual(['b', 'd', 'a'])
})
test('no key: plain setup message and no YouTube call', async () => {
  delete process.env.YOUTUBE_API_KEY
  let called = 0; const r = res(); await runVideoSearch({ q: 'x' }, r, async () => { called++ })
  expect(r.code).toBe(400); expect(r.body.error).toContain('YOUTUBE_API_KEY'); expect(called).toBe(0)
})
test('quota error is plain English', async () => {
  process.env.YOUTUBE_API_KEY = 'k'; const r = res()
  await runVideoSearch({ q: 'x' }, r, async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) }))
  expect(r.body.error).toMatch(/daily search limit/)
})
