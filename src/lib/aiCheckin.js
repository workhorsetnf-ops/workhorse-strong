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

export function buildPrompt(facts, examples = [], painNotes = []) {
  const system = [
    'You help Anthony Henry, a pro wrestler and online coach for professional wrestlers, review a client\'s weekly check-in.',
    'Write like Anthony: direct, warm, locker-room plain. Short sentences. Specific numbers from the data. No fluff, no hype words, no hashtags, at most one emoji.',
    'Never invent data. If something is missing, say it is missing. Do not diagnose injuries or give medical advice; if pain or illness is mentioned, flag it for Anthony.',
    'Return ONLY a JSON object with keys:',
    '"summary": 3-5 short bullet strings for Anthony (what happened this week, most important first),',
    '"watch": 0-3 short strings for Anthony about risks or things to ask (pain, low energy, missed sessions, under-eating),',
    '"reply": the message to the client in Anthony\'s voice, 60-140 words, addressed by first name: acknowledge one real win, name the one thing to fix, give one clear action for next week. No sign-off name.',
  ].join('\n')
  let user = `Week data (JSON):\n${JSON.stringify(facts)}`
  if (painNotes.length) user += `\n\nOpen pain/injury flags on exercises: ${JSON.stringify(painNotes)}`
  if (examples.length) user += `\n\nPast replies Anthony wrote, for voice only (do not copy content):\n${examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
  return { system, user }
}

// Pull the JSON object out of the model's text, tolerating code fences.
export function parseAi(text) {
  const s = String(text || '')
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a === -1 || b <= a) throw new Error('The AI reply was not in the expected format.')
  const o = JSON.parse(s.slice(a, b + 1))
  const list = v => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 6) : [])
  const reply = String(o.reply || '').trim()
  if (!reply) throw new Error('The AI did not draft a reply.')
  return { summary: list(o.summary), watch: list(o.watch), reply }
}
