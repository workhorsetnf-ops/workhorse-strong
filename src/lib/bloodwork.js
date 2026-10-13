// Bloodwork markers and the default reference ranges shown when a client has no
// lab-specific range saved. Defaults are common adult male ranges — labs differ,
// so the coach should copy the range printed on the client's own report.
// For tracking only, never diagnosis: anything flagged goes to the client's doctor.

export const MARKERS = [
  ['Lipids', 'Total Cholesterol', 'mg/dL', 125, 200],
  ['Lipids', 'LDL Cholesterol', 'mg/dL', null, 99],
  ['Lipids', 'HDL Cholesterol', 'mg/dL', 40, null],
  ['Lipids', 'Triglycerides', 'mg/dL', null, 149],
  ['Blood sugar', 'Fasting Glucose', 'mg/dL', 70, 99],
  ['Blood sugar', 'HbA1c', '%', 4.0, 5.6],
  ['Blood sugar', 'Fasting Insulin', 'µIU/mL', 2.6, 24.9],
  ['Hormones', 'Total Testosterone', 'ng/dL', 264, 916],
  ['Hormones', 'Free Testosterone', 'pg/mL', 46, 224],
  ['Hormones', 'Estradiol (E2)', 'pg/mL', 8, 42],
  ['Hormones', 'SHBG', 'nmol/L', 16.5, 55.9],
  ['Hormones', 'LH', 'mIU/mL', 1.7, 8.6],
  ['Hormones', 'FSH', 'mIU/mL', 1.5, 12.4],
  ['Hormones', 'Prolactin', 'ng/mL', 4.0, 15.2],
  ['Thyroid', 'TSH', 'µIU/mL', 0.45, 4.5],
  ['Thyroid', 'Free T4', 'ng/dL', 0.82, 1.77],
  ['Thyroid', 'Free T3', 'pg/mL', 2.0, 4.4],
  ['Liver', 'ALT', 'U/L', null, 44],
  ['Liver', 'AST', 'U/L', null, 40],
  ['Liver', 'GGT', 'U/L', null, 65],
  ['Kidney', 'Creatinine', 'mg/dL', 0.76, 1.27],
  ['Kidney', 'eGFR', 'mL/min', 60, null],
  ['Kidney', 'BUN', 'mg/dL', 6, 24],
  ['Blood count & iron', 'Hemoglobin', 'g/dL', 13.0, 17.7],
  ['Blood count & iron', 'Hematocrit', '%', 37.5, 51.0],
  ['Blood count & iron', 'RBC', 'x10⁶/µL', 4.14, 5.80],
  ['Blood count & iron', 'WBC', 'x10³/µL', 3.4, 10.8],
  ['Blood count & iron', 'Platelets', 'x10³/µL', 150, 450],
  ['Blood count & iron', 'Ferritin', 'ng/mL', 30, 400],
  ['Vitamins & other', 'Vitamin D (25-OH)', 'ng/mL', 30, 100],
  ['Vitamins & other', 'Vitamin B12', 'pg/mL', 232, 1245],
  ['Vitamins & other', 'hs-CRP', 'mg/L', null, 3.0],
  ['Vitamins & other', 'PSA', 'ng/mL', null, 4.0],
].map(([category, name, unit, low, high]) => ({ category, name, unit, low, high }))

// Notes worth knowing for athletes — shown next to the marker, not as advice.
export const MARKER_NOTES = {
  'Creatinine': 'Often reads high with lots of muscle, high protein or creatine.',
  'eGFR': 'Calculated from creatinine, so it can read low in very muscular athletes.',
  'ALT': 'Can run high for a few days after hard training.',
  'AST': 'Can run high for a few days after hard training.',
}

export const CATEGORIES = [...new Set(MARKERS.map(m => m.category))]

// The range to judge against: the client's saved range wins, else the default.
export function rangeFor(marker, overrides = {}) {
  const def = MARKERS.find(m => m.name === marker) || { low: null, high: null }
  const o = overrides[marker]
  return {
    low: o && o.ref_low !== null && o.ref_low !== undefined ? Number(o.ref_low) : def.low,
    high: o && o.ref_high !== null && o.ref_high !== undefined ? Number(o.ref_high) : def.high,
    custom: !!o,
  }
}

export function statusOf(value, range) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return null
  const v = Number(value)
  if (range.low !== null && range.low !== undefined && v < range.low) return 'LOW'
  if (range.high !== null && range.high !== undefined && v > range.high) return 'HIGH'
  return 'IN RANGE'
}

// tests: [{id, test_date}], results: [{test_id, marker, value}]
// -> { [marker]: { latest: {value, test_date} | null, byTest: {testId: value} } }
export function resultsByMarker(tests, results) {
  const date = Object.fromEntries(tests.map(t => [t.id, t.test_date]))
  const out = {}
  for (const r of results) {
    const m = (out[r.marker] ||= { latest: null, byTest: {} })
    m.byTest[r.test_id] = Number(r.value)
    const d = date[r.test_id]
    if (d && (!m.latest || d > m.latest.test_date)) m.latest = { value: Number(r.value), test_date: d }
  }
  return out
}

export const fmtRange = r => (r.low !== null && r.low !== undefined && r.high !== null && r.high !== undefined)
  ? `${r.low}–${r.high}` : (r.low !== null && r.low !== undefined) ? `≥ ${r.low}` : (r.high !== null && r.high !== undefined) ? `≤ ${r.high}` : '—'
