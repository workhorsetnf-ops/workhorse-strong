// Show-day fuel plan, built from the client's own macro targets and bodyweight
// and timed back from their match (bell) time. Coach's defaults; guidance, not
// a prescription.

const r5 = n => Math.max(0, Math.round(n / 5) * 5)

// "19:30" -> minutes after midnight; null if unset
export const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null }
export function fmtMin(m) {
  m = ((m % 1440) + 1440) % 1440
  const h = Math.floor(m / 60), mm = m % 60
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// macros: { p, c, f } daily grams; weightLb: latest bodyweight; bell: 'HH:MM' or null
export function fuelPlan({ macros = {}, weightLb = null, bell = null }) {
  const C = Number(macros.c) || 300, P = Number(macros.p) || 180
  const kg = weightLb ? weightLb / 2.2046 : null
  const preCarb = r5(Math.max(60, C * 0.25)), snackCarb = r5(Math.min(50, Math.max(25, C * 0.1)))
  const postCarb = r5(Math.max(40, C * 0.2))
  const prot = r5(Math.min(45, Math.max(25, P * 0.2)))
  const fluidOz = kg ? Math.round((kg * 6) / 29.57) : 16           // ~5–7 ml/kg 2–4 h before
  const B = toMin(bell)
  const at = off => (B === null ? null : fmtMin(B + off))
  const steps = [
    { when: at(-210) || '3–4 hours before', title: 'Pre-show meal', body: `About ${preCarb} g carbs and ${prot} g protein, low fat and low fiber. Familiar food you know sits well: rice or potatoes, chicken or turkey, a little fruit.`, macros: { c: preCarb, p: prot } },
    { when: at(-180) || '2–3 hours before', title: 'Hydrate', body: `Drink about ${fluidOz} oz of water with electrolytes, then sip to thirst. Pale yellow pee means you’re good.` },
    { when: at(-75) || '60–90 minutes before', title: 'Top-up snack', body: `About ${snackCarb} g fast carbs, almost no fat or fiber: banana, rice cakes with honey, a sports drink or gummies.`, macros: { c: snackCarb } },
    { when: at(-30) || '30 minutes before', title: 'Final sips', body: '8–16 oz of water or a sports drink. Caffeine now only if you normally use it, never for the first time on a show day.' },
    { when: at(0) || 'Bell time', title: 'Work', body: 'Between bumps and in the back: sip water or electrolytes. Hot building or long match: add a sports drink.' },
    { when: at(60) || 'Within 1–2 hours after', title: 'Post-show meal', body: `About ${prot + 10} g protein and ${postCarb} g carbs to start recovery. Road food works: burrito bowl, double-meat sub, or a protein shake plus a bagel if that’s all that’s open.`, macros: { c: postCarb, p: prot + 10 } },
  ]
  return { steps, timed: B !== null, note: 'The rest of your carbs and protein for the day go in your normal meals.' }
}

export const tomorrowTip = 'Show tomorrow: hit your carbs today, drink an extra bottle of water, and keep salt normal. Nothing new to eat.'
