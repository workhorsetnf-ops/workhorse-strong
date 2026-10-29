// Personal records from logged sets. A set is a PR when it beats every earlier
// day for that exercise on estimated 1-rep max (Epley) or on top weight.
// Only lifts with both weight and reps count; first-ever sessions aren't PRs.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))
export const nameKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function e1rm(weight, reps) {
  const w = num(weight), r = num(reps)
  if (!w || !r || r < 1 || r > 15) return null       // high-rep sets don't predict a max well
  return r === 1 ? w : w * (1 + r / 30)
}

// rows: earlier sets [{ weight, reps }] -> { e1rm, weight, sets }
export function bestOf(rows) {
  let b = { e1rm: 0, weight: 0, sets: 0 }
  for (const r of rows) {
    const w = num(r.weight), reps = num(r.reps)
    if (!w || !reps) continue
    b.sets++
    b.weight = Math.max(b.weight, w)
    const e = e1rm(w, reps); if (e) b.e1rm = Math.max(b.e1rm, e)
  }
  return b
}

// Is this set a PR against the earlier best? Returns { kind, label } or null.
export function prFor(set, best) {
  const w = num(set.weight), r = num(set.reps)
  if (!w || !r || !best || best.sets === 0) return null
  if (w > best.weight) return { kind: 'weight', label: `Heaviest ever: ${w} × ${r}` }
  const e = e1rm(w, r)
  if (e && e > best.e1rm + 0.5) return { kind: 'e1rm', label: `Best set ever: ${w} × ${r} (≈${Math.round(e)} 1RM)` }
  return null
}

// All PRs set inside [from, to] from a full history, grouped by exercise.
// rows: [{ exercise_name, weight, reps, logged_date }]
export function prsInRange(rows, from, to) {
  const by = {}
  for (const r of rows) (by[nameKey(r.exercise_name)] ||= []).push(r)
  const out = []
  for (const list of Object.values(by)) {
    list.sort((a, b) => String(a.logged_date).localeCompare(String(b.logged_date)))
    const days = [...new Set(list.map(r => r.logged_date))]
    for (const d of days) {
      if (d < from || d > to) continue
      const before = bestOf(list.filter(r => r.logged_date < d))
      const today = list.filter(r => r.logged_date === d)
      let top = null
      for (const s of today) { const p = prFor(s, before); if (p && (!top || (e1rm(s.weight, s.reps) || 0) > (e1rm(top.weight, top.reps) || 0))) top = { ...s, ...p } }
      if (top) out.push({ name: top.exercise_name, date: d, weight: num(top.weight), reps: num(top.reps), kind: top.kind, label: top.label })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

// Current bests per exercise for the Records page.
export function recordBoard(rows) {
  const by = {}
  for (const r of rows) {
    const w = num(r.weight), reps = num(r.reps)
    if (!w || !reps) continue
    const k = nameKey(r.exercise_name)
    const cur = by[k] ||= { name: r.exercise_name, top: null, best: null, sessions: new Set() }
    cur.sessions.add(r.logged_date)
    if (!cur.top || w > cur.top.weight || (w === cur.top.weight && reps > cur.top.reps)) cur.top = { weight: w, reps, date: r.logged_date }
    const e = e1rm(w, reps)
    if (e && (!cur.best || e > cur.best.e1rm)) cur.best = { weight: w, reps, e1rm: e, date: r.logged_date }
  }
  return Object.values(by).map(x => ({ ...x, sessions: x.sessions.size }))
    .sort((a, b) => (b.best?.e1rm || b.top.weight) - (a.best?.e1rm || a.top.weight))
}
