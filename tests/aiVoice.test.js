// AI check-in drafts learn Anthony's voice (Update 161).
import { test, expect } from 'vitest'
import { similarity, pickVoiceExamples, buildPrompt, UNEDITED } from '../src/lib/aiCheckin'

const ai = 'Elliot, big week. You hit protein 6 of 7 days and the scale moved 2.1 lb. The one thing to fix is steps, you averaged 4,200. Next week get to 7,000 a day, walk after dinner.'
const mine = "Elliot! Protein locked in 6 for 7 and down 2.1. That's the work paying off brother. Steps are the leak though, 4,200 ain't it. Walk 20 after dinner every night this week. Lock in."

test('small tweaks count as unedited, rewrites do not', () => {
  expect(similarity(ai, ai)).toBe(1)
  expect(similarity(ai, ai.replace('walk after dinner', 'walk after supper'))).toBeGreaterThanOrEqual(UNEDITED)
  expect(similarity(ai, mine)).toBeLessThan(0.5)
})
test('edits keep only real rewrites; unedited drafts never count as his writing', () => {
  const r = pickVoiceExamples({ aiReplies: [{ draft: ai, sent: ai }, { draft: ai, sent: mine }], feedback: [{ text: ai, aiDraft: ai, client_id: 'a' }, { text: mine, aiDraft: ai, client_id: 'b' }] })
  expect(r.edits.map(e => e.sent)).toEqual([mine]); expect(r.written).toEqual([mine])
})
test('recent replies to this client, newest first, not repeated', () => {
  const fb = [1, 2, 3].map(i => ({ text: `${mine} reply ${i}`, client_id: 'e' })).concat([{ text: mine + ' other', client_id: 'x' }])
  const r = pickVoiceExamples({ feedback: fb, clientId: 'e' })
  expect(r.recent).toHaveLength(2); expect(r.recent[0]).toContain('reply 1'); expect(r.written).toHaveLength(2)
})
test('prompt carries guide, edits and recent; nothing empty when there is no voice data', () => {
  const { system, user } = buildPrompt({ client: 'Elliot' }, { edits: [{ draft: ai, sent: mine }], written: [], recent: ['walk 20'] }, [], 'Say brother.')
  expect(system).toContain('guide wins'); expect(user).toContain('<voice_guide>\nSay brother.'); expect(user).toContain('<anthony_sent>')
  const empty = buildPrompt({ client: 'E' }, { edits: [], written: [], recent: [] }, [], '')
  expect(empty.user).not.toContain('<edits>'); expect(empty.user).not.toContain('Past replies')
})
