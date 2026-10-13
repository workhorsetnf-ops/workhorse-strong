// Workhorse starting-macros methodology: Mifflin-St Jeor + wrestler multipliers
export function calcMacros({ weightLbs, age, sex, hft, hin, bf, activity, goal }) {
  const kg = weightLbs / 2.2046
  const cm = (hft * 12 + hin) * 2.54
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
  const mult = { 'lifting-only': 1.45, 'light-schedule': 1.55, 'working-talent': 1.65, 'heavy-schedule': 1.8 }[activity]
  const tdee = Math.round((bmr * mult) / 25) * 25
  let target = goal === 'cut' ? tdee - 500 : goal === 'build' ? tdee + 300 : tdee
  const notes = []
  if (goal === 'cut') {
    const floor = 10 * weightLbs
    if (target < floor) { target = Math.round(floor / 25) * 25; notes.push('Calories floored at 10× bodyweight — the straight −500 cut too deep.') }
  }
  let proteinBase = weightLbs
  if (weightLbs >= 250 && bf && +bf > 25) {
    proteinBase = (weightLbs * (1 - +bf / 100)) * 1.2
    notes.push('Protein set off estimated lean mass +20% (250+ lbs at higher body fat).')
  }
  const protein = Math.round(proteinBase / 5) * 5
  const fat = Math.max(50, Math.round((weightLbs * (goal === 'cut' ? 0.35 : 0.4)) / 5) * 5)
  const carbs = Math.max(0, Math.round(((target - protein * 4 - fat * 9) / 4) / 5) * 5)
  if (!bf) notes.push('No body fat estimate — first two weeks of scale data matter more than the formula.')
  return { tdee, target, protein, carbs, fat, notes }
}

// Activity levels for pro wrestlers (multiplier on BMR).
export const ACTIVITY = [
  ['lifting-only', 'Lifting only', 1.45],
  ['light-schedule', 'Light schedule', 1.55],
  ['working-talent', 'Working talent', 1.65],
  ['heavy-schedule', 'Heavy schedule / travel', 1.8],
]

// Mifflin-St Jeor BMR, shown on the calculator for reference.
export function bmrOf({ weightLbs, age, sex, hft, hin }) {
  const kg = weightLbs / 2.2046
  const cm = (hft * 12 + hin) * 2.54
  return Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161))
}
