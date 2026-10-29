// Snap-a-photo food logging: prompt, reading the AI's answer, and the maths
// for scaling each item when the client changes the grams.

export const DAILY_PHOTO_LIMIT = 25

export function photoPrompt(note = '') {
  const system = [
    'You estimate the foods, portions and macros in a meal photo for a fitness coaching app.',
    'Identify each distinct food. Estimate the cooked/as-served weight in grams from visual cues (plate ~27 cm, fork ~19 cm, hand, packaging).',
    'Give nutrition per 100 g for that food as served, including likely cooking oil, butter, sauces and dressings you can see or that are typical.',
    'If the client\'s note gives amounts or ingredients, trust the note over the picture.',
    'If it is not food or you cannot tell, return an empty items list and say why in "warning".',
    'Return ONLY JSON: {"items":[{"name":"short food name","grams":number,"per100":{"kcal":number,"p":number,"c":number,"f":number,"fiber":number}}],"confidence":"high"|"medium"|"low","warning":"one short sentence or empty"}',
  ].join('\n')
  const user = note.trim() ? `Client's note: ${note.trim().slice(0, 300)}` : 'No note from the client.'
  return { system, user }
}

const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function parsePhotoAi(input) {
  let o = input
  if (!o || typeof o !== 'object') {
    const s = String(input || '')
    const a = s.indexOf('{'), b = s.lastIndexOf('}')
    if (a === -1 || b <= a) throw new Error('Could not read the estimate. Try again.')
    o = JSON.parse(s.slice(a, b + 1))
  }
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 12).map(i => ({
    name: String(i.name || 'Food').slice(0, 80),
    grams: Math.round(clamp(n(i.grams), 1, 3000)),
    per100: {
      kcal: clamp(n(i.per100?.kcal), 0, 950), p: clamp(n(i.per100?.p), 0, 100), c: clamp(n(i.per100?.c), 0, 100),
      f: clamp(n(i.per100?.f), 0, 100), fiber: clamp(n(i.per100?.fiber), 0, 60),
    },
  })).filter(i => i.name)
  const confidence = ['high', 'medium', 'low'].includes(o.confidence) ? o.confidence : 'medium'
  return { items, confidence, warning: String(o.warning || '').slice(0, 200) }
}

export function itemTotals(i) {
  const k = n(i.grams) / 100
  return { kcal: Math.round(i.per100.kcal * k), p: Math.round(i.per100.p * k), c: Math.round(i.per100.c * k), f: Math.round(i.per100.f * k), fiber: Math.round(i.per100.fiber * k * 10) / 10 }
}

export function mealTotals(items) {
  return items.reduce((a, i) => { const t = itemTotals(i); return { kcal: a.kcal + t.kcal, p: a.p + t.p, c: a.c + t.c, f: a.f + t.f } }, { kcal: 0, p: 0, c: 0, f: 0 })
}

// meal_logs rows for the confirmed items.
export function photoRows(items, { clientId, date, slot }) {
  return items.filter(i => n(i.grams) > 0).map(i => {
    const t = itemTotals(i)
    return { client_id: clientId, logged_on: date, meal: slot, meal_name: `📷 ${i.name} — ${Math.round(i.grams)}g`, grams: Math.round(i.grams),
      protein_g: t.p, carbs_g: t.c, fat_g: t.f, fiber_g: t.fiber, source: 'photo', estimated: true }
  })
}

export const PHOTO_TOOL = {
  name: 'meal_estimate',
  description: 'Return the foods seen in the meal photo with estimated grams and nutrition per 100 g.',
  schema: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' }, grams: { type: 'number' },
        per100: { type: 'object', properties: { kcal: { type: 'number' }, p: { type: 'number' }, c: { type: 'number' }, f: { type: 'number' }, fiber: { type: 'number' } }, required: ['kcal', 'p', 'c', 'f'] },
      }, required: ['name', 'grams', 'per100'] } },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      warning: { type: 'string' },
    },
    required: ['items', 'confidence'],
  },
}
