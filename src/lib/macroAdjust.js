// Weekly macro adjustment helper: looks at the scale trend against the phase
// goal and suggests one change (or "hold") for the coach to approve.
// Carbs move first (high-carb, moderate-protein, low-fat approach); protein
// stays put; fat only moves if carbs would drop under the floor.

const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export const CARB_FLOOR = 100
export const FAT_FLOOR = 40
export const MIN_DAYS_BETWEEN = 10

// Weekly rate goals as % of bodyweight per week: [lowest ok, highest ok]
export const GOALS = {
  cut: [-1.0, -0.4],
  build: [0.1, 0.5],
  maintain: [-0.4, 0.4],
  recomp: [-0.5, 0.2],
}

// days: array of 7 'YYYY-MM-DD' for this week; daily: daily_logs rows covering
// this week and the two before. Returns the weekly rate using up to a 2-week
// span so one salty weekend doesn't swing the call.
export function weightTrend(daily, days, addDays) {
  const wk = start => { const ds = Array.from({ length: 7 }, (_, i) => addDays(start, i)); return daily.filter(r => ds.includes(r.log_date)).map(r => num(r.weight)).filter(v => v !== null) }
  const now = wk(days[0]), prev = wk(addDays(days[0], -7)), prev2 = wk(addDays(days[0], -14))
  const a = avg(now)
  if (now.length < 3 || a === null) return { ok: false, reason: `Only ${now.length} weigh-in${now.length === 1 ? '' : 's'} this week. Need 3+ for a call.`, weighIns: now.length }
  const base = prev2.length >= 3 ? { w: avg(prev2), weeks: 2 } : prev.length >= 3 ? { w: avg(prev), weeks: 1 } : null
  if (!base) return { ok: false, reason: 'Need at least 3 weigh-ins in one of the last two weeks to compare against.', weighIns: now.length }
  const perWeek = (a - base.w) / base.weeks
  return { ok: true, avg: a, perWeek, pct: (perWeek / a) * 100, weeks: base.weeks, weighIns: now.length }
}

// macros: { p, c, f }; adherence: { loggedDays, onTarget, judged }
export function suggestAdjustment({ phase = 'cut', macros, trend, adherence, lastChangeDays = null }) {
  const m = { p: Math.round(num(macros?.p) || 0), c: Math.round(num(macros?.c) || 0), f: Math.round(num(macros?.f) || 0) }
  const kcal = x => x.p * 4 + x.c * 4 + x.f * 9
  const hold = (why, kind = 'hold') => ({ kind, why, from: m, to: m, deltaKcal: 0 })
  if (!m.p && !m.c && !m.f) return hold('No macros set for this client yet.', 'nodata')
  if (!trend?.ok) return hold(trend?.reason || 'Not enough weigh-ins.', 'nodata')
  if (lastChangeDays !== null && lastChangeDays < MIN_DAYS_BETWEEN) return hold(`Macros changed ${lastChangeDays} day${lastChangeDays === 1 ? '' : 's'} ago. Give it ${MIN_DAYS_BETWEEN}+ days before judging.`)
  const logged = adherence?.loggedDays ?? 0
  const onPct = adherence?.judged ? adherence.onTarget / adherence.judged : null
  if (logged < 5 || (onPct !== null && onPct < 0.6)) {
    return hold(`Adherence first: ${logged}/7 days logged${onPct !== null ? `, ${adherence.onTarget}/${adherence.judged} on target` : ''}. Changing numbers they aren't hitting won't tell you anything.`, 'adherence')
  }
  const goal = GOALS[phase] || GOALS.maintain
  const r = trend.pct
  const rateTxt = `${trend.perWeek > 0 ? '+' : ''}${trend.perWeek.toFixed(1)} lb/wk (${r > 0 ? '+' : ''}${r.toFixed(2)}% BW)`
  const target = `${goal[0]}% to ${goal[1]}%`
  let deltaKcal = 0
  if (r > goal[1]) deltaKcal = phase === 'build' && r < goal[1] + 0.3 ? -100 : -150
  else if (r < goal[0]) deltaKcal = phase === 'cut' && r > goal[0] - 0.3 ? 100 : 150
  if (!deltaKcal) return hold(`Trend ${rateTxt} is inside the ${phase} target (${target}). Keep everything the same.`, 'hold')

  const to = { ...m }
  let carbs = Math.round(deltaKcal / 4 / 5) * 5          // nearest 5 g
  if (to.c + carbs < CARB_FLOOR) {
    const room = Math.max(0, to.c - CARB_FLOOR)
    carbs = -room
    const left = deltaKcal + room * 4                        // still negative
    to.f = Math.max(FAT_FLOOR, to.f + Math.round(left / 9))
  }
  to.c += carbs
  const why = deltaKcal < 0
    ? `Trend ${rateTxt} is ${phase === 'cut' ? 'too slow for a cut' : 'faster than the target'} (${target}).`
    : `Trend ${rateTxt} is ${phase === 'build' ? 'too slow for a build' : 'dropping faster than the target'} (${target}).`
  return { kind: deltaKcal < 0 ? 'down' : 'up', why, from: m, to, deltaKcal: kcal(to) - kcal(m), kcalFrom: kcal(m), kcalTo: kcal(to) }
}

export function clientNote(s, firstName) {
  const parts = []
  if (s.to.c !== s.from.c) parts.push(`carbs ${s.from.c}g → ${s.to.c}g`)
  if (s.to.f !== s.from.f) parts.push(`fat ${s.from.f}g → ${s.to.f}g`)
  return `${firstName ? firstName + ', ' : ''}small macro update based on your weekly trend: ${parts.join(', ')}. Protein stays at ${s.to.p}g. Same plan otherwise, keep logging.`
}
