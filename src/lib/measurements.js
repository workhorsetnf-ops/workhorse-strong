// Measurement log maths, matching the coaching sheet's Measurements tab.

// Columns in sheet order. db = column name in body_measurements.
export const MEASURES = [
  { db: 'weight', label: 'Weight', short: 'Weight', unit: 'lb', dp: 1 },
  { db: 'neck', label: 'Neck', short: 'Neck' },
  { db: 'chest', label: 'Chest', short: 'Chest' },
  { db: 'shoulders', label: 'Shoulders', short: 'Shldrs' },
  { db: 'waist', label: 'Waist', short: 'Waist', key: true },
  { db: 'hips', label: 'Hips', short: 'Hips' },
  { db: 'arms', label: 'Arm (R)', short: 'Arm R' },
  { db: 'arm_l', label: 'Arm (L)', short: 'Arm L' },
  { db: 'thighs', label: 'Thigh (R)', short: 'Thigh R' },
  { db: 'thigh_l', label: 'Thigh (L)', short: 'Thigh L' },
  { db: 'calf', label: 'Calf', short: 'Calf' },
]

export const HOW_TO = [
  ['Neck', "Just below the Adam's apple, tape sloping slightly down to the front"],
  ['Waist', 'At the navel, relaxed, after a normal exhale. Used for body fat'],
  ['Chest / Shoulders', 'Chest across the nipples; shoulders around the widest point of the delts'],
  ['Arms / Thighs / Calf', 'Widest point, relaxed. Same side, same spot every time'],
  ['Hips', 'Widest point of the glutes. Needed for the female body-fat formula'],
]

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

// US Navy tape estimate, inches. Returns a fraction (0.183 = 18.3%) or null.
export function bodyFat({ waist, neck, hips }, heightIn, sex = 'male') {
  const w = num(waist), n = num(neck), h = num(heightIn), hp = num(hips)
  if (!w || !n || !h) return null
  let pct
  if (sex === 'female') {
    if (!hp || w + hp - n <= 0) return null
    pct = 163.205 * Math.log10(w + hp - n) - 97.684 * Math.log10(h) - 78.387
  } else {
    if (w - n <= 0) return null
    pct = 86.01 * Math.log10(w - n) - 70.041 * Math.log10(h) + 36.76
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 70) return null
  return pct / 100
}

// Each row plus body fat %, fat lb and lean lb (needs weight).
export function withComposition(rows, heightIn, sex) {
  return rows.map(r => {
    const bf = bodyFat(r, heightIn, sex)
    const w = num(r.weight)
    const fat = bf !== null && w ? w * bf : null
    return { ...r, bf, fatLb: fat, leanLb: fat !== null ? w - fat : null }
  })
}

// Latest minus first, per column, using only rows that have that column.
export function changeOf(rows, key) {
  const vals = rows.map(r => num(r[key])).filter(v => v !== null && !Number.isNaN(v))
  if (vals.length < 2) return null
  return vals[vals.length - 1] - vals[0]
}

export function latestOf(rows, key) {
  for (let i = rows.length - 1; i >= 0; i--) { const v = num(rows[i][key]); if (v !== null) return v }
  return null
}
export function firstOf(rows, key) {
  for (const r of rows) { const v = num(r[key]); if (v !== null) return v }
  return null
}

export const signed = (v, dp = 2) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dp)}`)

const utc = d => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) }

// Photos: turn check-ins into sheet rows (week, date, weight, front/side/back paths).
export function photoRows(checkins, startDate, localDate) {
  return checkins
    .map(c => {
      const date = localDate(new Date(c.submitted_at))
      const byLabel = { Front: null, Side: null, Back: null }
      const others = []
      for (const p of c.photos || []) {
        if (p?.label && p.label in byLabel && !byLabel[p.label]) byLabel[p.label] = p.path
        else if (p?.path) others.push(p.path)
      }
      // older check-ins only have photo_urls; fill the empty slots in order
      for (const path of c.photo_urls || []) {
        if (Object.values(byLabel).includes(path) || others.includes(path)) continue
        const slot = Object.keys(byLabel).find(k => !byLabel[k])
        if (slot) byLabel[slot] = path; else others.push(path)
      }
      const week = startDate ? Math.floor((utc(date) - utc(startDate)) / (7 * 864e5)) : null   // sheet: INT((date - start) / 7)
      return { id: c.id, date, week, weight: c.weight, note: c.photo_note || '', ...byLabel, others }
    })
    .filter(r => r.Front || r.Side || r.Back || r.others.length)
    .sort((a, b) => a.date.localeCompare(b.date))
}
