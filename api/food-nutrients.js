// Companion to food-search.js — Nutritionix's "common foods" (chicken breast, banana, etc.)
// come back from search without exact macros; this looks them up via natural language.
// Only used when NUTRITIONIX_APP_ID/APP_KEY are set.

export default async function handler(req, res) {
  const query = (req.query.food || '').trim()
  if (!query) return res.status(400).json({ error: 'Missing food parameter' })

  const { NUTRITIONIX_APP_ID, NUTRITIONIX_APP_KEY } = process.env
  if (!NUTRITIONIX_APP_ID || !NUTRITIONIX_APP_KEY) {
    return res.status(400).json({ error: 'Nutritionix not configured' })
  }

  try {
    const r = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
      method: 'POST',
      headers: { 'x-app-id': NUTRITIONIX_APP_ID, 'x-app-key': NUTRITIONIX_APP_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!r.ok) return res.status(502).json({ error: `Nutritionix HTTP ${r.status}` })
    const data = await r.json()
    const food = data.foods?.[0]
    if (!food) return res.status(404).json({ error: 'No match found' })
    return res.status(200).json({
      name: food.food_name, servingQty: food.serving_qty, servingUnit: food.serving_unit,
      p: +food.nf_protein || 0, c: +food.nf_total_carbohydrate || 0, f: +food.nf_total_fat || 0,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
