// What the AI sees for a weekly check-in, and how its answer is read back.
// Shared by the review page (builds the facts) and /api/checkin-ai (sends them).

const r1 = v => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 10) / 10)
const pctOf = v => (v === null || v === undefined ? null : Math.round(v * 100))

// Compact, numbers-only picture of the week. Nothing here the coach can't see
// on the review page; names are first names only.
export function checkinFacts({ profile, review: R, checkin, weekStart }) {
  const first = String(profile?.full_name || '').trim().split(/\s+/)[0] || 'the client'
  const t = R?.nutrition?.targets || {}
  const f = {
    client: first, phase: profile?.phase || null, week_of: weekStart,
    event: profile?.event_date ? { name: profile.event_name || 'event', date: profile.event_date } : null,
    training: R ? { sessions_done: R.training.done, sessions_planned: R.training.planned } : null,
    nutrition: R ? {
      days_logged: R.nutrition.loggedDays, days_on_target: R.nutrition.onTarget, days_judged: R.nutrition.judged,
      avg_kcal: r1(R.nutrition.avgKcal), avg_protein_g: r1(R.nutrition.avgP),
      target_kcal: t.kcal || null, target_protein_g: t.p || null, target_carbs_g: t.c || null, target_fat_g: t.f || null,
    } : null,
    habits: R?.habits ? { pct: pctOf(R.habits.pct), weakest: R.habits.worst ? `${R.habits.worst.name} (${pctOf(R.habits.worst.pct)}%)` : null } : null,
    supplements_pct: R?.supplements ? pctOf(R.supplements.pct) : null,
    cardio: R?.cardio ? { minutes: R.cardio.minutes, planned: R.cardio.planned } : null,
    body: R ? {
      avg_weight_lb: r1(R.body.weight), change_vs_last_week_lb: R.body.change, weigh_ins: R.body.weighIns,
      avg_steps: R.body.steps === null ? null : Math.round(R.body.steps), avg_sleep_h: r1(R.body.sleep),
      waist_change_in: R.measurements ? R.measurements.waistChange : null,
    } : null,
    wins: R?.wins || [], needs_a_word: R?.flags || [],
    // client's own "How did that feel?" after each session, 1-10 (Update 169)
    sessions_felt: (R?.feel || []).slice(0, 14).map(f => ({ date: f.session_date, session: f.day_label || null, effort: f.rpe, note: String(f.note || '').slice(0, 300) || null })),
    checkin: checkin ? {
      weight: checkin.weight ?? null, energy: checkin.energy ?? null, hunger: checkin.hunger ?? null,
      sleep_avg: checkin.sleep_avg ?? null, stress: checkin.stress ?? null,
      notes: String(checkin.notes || '').slice(0, 1500),
      answers: (Array.isArray(checkin.form_responses) ? checkin.form_responses : [])
        .filter(a => a && a.label && a.value !== '' && a.value !== null && a.value !== undefined)
        .slice(0, 25).map(a => ({ q: String(a.label).slice(0, 160), a: String(a.value).slice(0, 600) })),
    } : null,
  }
  return f
}

// ---- Voice (Update 161) ----
// How alike two replies are, 0-1, by shared word pairs. Used to tell an AI
// draft sent as-is (or with a typo fixed) from one Anthony actually rewrote.
const words = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/).filter(Boolean)
export function similarity(a, b) {
  const pairs = s => { const w = words(s); const m = new Map(); for (let i = 0; i < w.length - 1; i++) { const k = w[i] + ' ' + w[i + 1]; m.set(k, (m.get(k) || 0) + 1) } return m }
  const A = pairs(a), B = pairs(b)
  const na = [...A.values()].reduce((t, v) => t + v, 0), nb = [...B.values()].reduce((t, v) => t + v, 0)
  if (!na && !nb) return words(a).join(' ') === words(b).join(' ') ? 1 : 0
  if (!na || !nb) return 0
  let shared = 0
  for (const [k, v] of A) shared += Math.min(v, B.get(k) || 0)
  return (2 * shared) / (na + nb)
}
export const UNEDITED = 0.9 // at or above this, the draft went out basically as the AI wrote it

const clip = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n) + '…' : s }

// Pick what the AI learns Anthony's voice from:
//   edits:   AI draft → what he actually sent, where he really changed it (best signal)
//   written: replies he wrote himself (drafts sent unedited are left out, so
//            the AI never ends up copying itself)
//   recent:  his last replies to THIS client, so it can follow up on them
// Inputs, newest first:
//   aiReplies: [{ draft, sent, client_id }]
//   feedback:  [{ text, aiDraft, client_id }]  (check-in feedback + the AI draft stored on that check-in, if any)
export function pickVoiceExamples({ aiReplies = [], feedback = [], clientId = null }) {
  const edits = []
  for (const r of aiReplies) {
    if (edits.length >= 6) break
    if (!r?.draft || !r?.sent) continue
    if (similarity(r.draft, r.sent) >= UNEDITED) continue
    edits.push({ draft: clip(r.draft, 700), sent: clip(r.sent, 700) })
  }
  const aiSent = aiReplies.filter(r => r?.sent && r?.draft && similarity(r.draft, r.sent) >= UNEDITED).map(r => r.sent)
  const isAi = t => aiSent.some(s => similarity(s, t) >= UNEDITED)
  const mine = feedback.filter(f => {
    const t = String(f?.text || '').trim()
    if (t.length < 60) return false
    if (f.aiDraft && similarity(f.aiDraft, t) >= UNEDITED) return false
    return !isAi(t)
  })
  const recent = clientId ? mine.filter(f => f.client_id === clientId).slice(0, 2).map(f => clip(f.text, 700)) : []
  const written = mine.filter(f => !(clientId && f.client_id === clientId && recent.includes(clip(f.text, 700))))
    .slice(0, 10).map(f => clip(f.text, 600))
  return { edits, written, recent }
}

// examples: either the old plain list of replies, or { edits, written, recent }
// from pickVoiceExamples. voiceGuide: Anthony's own notes on how he talks.
export function buildPrompt(facts, examples = [], painNotes = [], voiceGuide = '') {
  const ex = Array.isArray(examples) ? { edits: [], written: examples, recent: [] } : { edits: [], written: [], recent: [], ...examples }
  const guide = String(voiceGuide || '').trim().slice(0, 4000)
  const system = [
    'You help Anthony Henry, a pro wrestler and online coach for professional wrestlers, review a client\'s weekly check-in.',
    'Write like Anthony: direct, warm, locker-room plain. Short sentences. Specific numbers from the data. No fluff, no hype words, no hashtags, at most one emoji.',
    ...(guide ? ['Anthony\'s own voice guide is in <voice_guide>. Follow it closely; where it disagrees with the line above, the guide wins.'] : []),
    ...(ex.edits.length ? ['<edits> shows drafts written for Anthony and what he actually sent instead. Study what he changes, adds and cuts, and write the way he rewrote them.'] : []),
    ...(ex.recent.length ? ['<recent_to_client> is what Anthony told this client in the last weeks. Follow up on any action he gave them, and do not reuse the same openers or phrases.'] : []),
    'Past replies are for voice only. Do not copy their content or numbers.',
    'Never invent data. If something is missing, say it is missing. Do not diagnose injuries or give medical advice; if pain or illness is mentioned, flag it for Anthony.',
    'Return ONLY a JSON object with keys:',
    '"summary": 3-5 short bullet strings for Anthony (what happened this week, most important first),',
    '"watch": 0-3 short strings for Anthony about risks or things to ask (pain, low energy, missed sessions, under-eating),',
    '"reply": the message to the client in Anthony\'s voice, 60-140 words, addressed by first name: acknowledge one real win, name the one thing to fix, give one clear action for next week. No sign-off name.',
  ].join('\n')
  let user = `Week data (JSON):\n${JSON.stringify(facts)}`
  if (painNotes.length) user += `\n\nOpen pain/injury flags on exercises: ${JSON.stringify(painNotes)}`
  if (guide) user += `\n\n<voice_guide>\n${guide}\n</voice_guide>`
  if (ex.edits.length) user += `\n\n<edits>\n${ex.edits.map((e, i) => `<edit n="${i + 1}">\n<draft>${e.draft}</draft>\n<anthony_sent>${e.sent}</anthony_sent>\n</edit>`).join('\n')}\n</edits>`
  if (ex.written.length) user += `\n\nPast replies Anthony wrote, for voice only (do not copy content):\n${ex.written.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
  if (ex.recent.length) user += `\n\n<recent_to_client>\n${ex.recent.map((e, i) => `${i === 0 ? 'Last reply' : 'Before that'}: ${e}`).join('\n')}\n</recent_to_client>`
  return { system, user }
}

// Pull the JSON object out of the model's text, tolerating code fences.
export function parseAi(input) {
  let o = input
  if (!o || typeof o !== 'object') {
    const s = String(input || '')
    const a = s.indexOf('{'), b = s.lastIndexOf('}')
    if (a === -1 || b <= a) throw new Error(`The AI reply was not in the expected format${s ? `: “${s.slice(0, 120)}…”` : ' (empty reply)'}. Tap Summarize again.`)
    o = JSON.parse(s.slice(a, b + 1))
  }
  const list = v => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 6) : [])
  const reply = String(o.reply || '').trim()
  if (!reply) throw new Error('The AI did not draft a reply.')
  return { summary: list(o.summary), watch: list(o.watch), reply }
}

export const SUMMARY_TOOL = {
  name: 'checkin_summary',
  description: 'Return the weekly summary for the coach and the drafted reply to the client.',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'array', items: { type: 'string' }, description: '3-5 short bullets for the coach, most important first' },
      watch: { type: 'array', items: { type: 'string' }, description: '0-3 short risks or things to ask about' },
      reply: { type: 'string', description: "60-140 word message to the client in the coach's voice" },
    },
    required: ['summary', 'watch', 'reply'],
    additionalProperties: false,
  },
}
