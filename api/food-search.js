// Vercel serverless function — runs on Vercel's servers, not in the browser,
// so it isn't subject to the CORS restriction that blocks a direct browser
// call to Open Food Facts' beta search API. Deploys automatically because
// it's in /api — no extra setup, same `git push` as everything else.
//
// If NUTRITIONIX_APP_ID and NUTRITIONIX_APP_KEY are set as Vercel env vars,
// this uses Nutritionix instead — much better search relevance and US
// branded/restaurant food coverage. Falls back to Open Food Facts if those
// aren't set, so this keeps working either way.

async function searchNutritionix(q, appId, appKey) {
  const res = await fetch('https://trackapi.nutritionix.com/v2/search/instant?query=' + encodeURIComponent(q), {
    headers: { 'x-app-id': appId, 'x-app-key': appKey },
  })
  if (!res.ok) throw new Error(`Nutritionix HTTP ${res.status}`)
  const data = await res.json()
  const branded = (data.branded || []).slice(0, 8).map(item => ({
    id: item.nix_item_id,
    name: item.food_name,
    brand: item.brand_name || '',
    servingQty: item.serving_qty || null,
    servingUnit: item.serving_unit || '',
    // branded items need a details call for exact macros — return per-serving as-is,
    // Nutritionix's photo/serving data is reliable enough to trust directly here
    p: +item.nf_protein || 0, c: +item.nf_total_carbohydrate || 0, f: +item.nf_total_fat || 0,
    per: 'serving',
  }))
  const common = (data.common || []).slice(0, 6).map(item => ({
    id: item.food_name, name: item.food_name, brand: '',
    servingQty: item.serving_qty || null, servingUnit: item.serving_unit || '',
    p: null, c: null, f: null, per: 'lookup', // common foods need a follow-up nutrients call
  }))
  return [...branded, ...common]
}

async function searchOpenFoodFacts(q) {
  const url = 'https://search.openfoodfacts.org/search?page_size=24&langs=en&q=' + encodeURIComponent(q)
  const offRes = await fetch(url, { headers: { 'User-Agent': 'WorkhorseStrong/1.0 (coaching app; contact via app)' } })
  if (!offRes.ok) throw new Error(`Open Food Facts HTTP ${offRes.status}`)
  const data = await offRes.json()
  const rawItems = data.hits || data.products || []

  let items = rawItems.map(raw => {
    try {
      const pr = raw.document || raw._source || raw
      const nutr = pr.nutriments || {}
      const brandsField = pr.brands
      return {
        id: pr.code || pr.id || null,
        name: pr.product_name || pr.product_name_en || null,
        brand: Array.isArray(brandsField) ? (brandsField[0] || '') : String(brandsField || '').split(',')[0],
        servingSize: pr.serving_size || '',
        p: +nutr.proteins_100g || 0, c: +nutr.carbohydrates_100g || 0, f: +nutr.fat_100g || 0,
        completeness: +pr.completeness || 0,
        popularity: +pr.unique_scans_n || +pr.popularity_key || 0,
        per: '100g',
      }
    } catch { return null }
  }).filter(it => it && it.name && (it.p || it.c || it.f))

  // dedupe near-identical name+brand pairs (common with crowdsourced data)
  const seen = new Set()
  items = items.filter(it => {
    const key = (it.name + '|' + it.brand).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // surface complete, popular entries first — this is the biggest lever we have
  // against noisy crowdsourced data without switching providers
  items.sort((a, b) => (b.completeness + b.popularity / 1000) - (a.completeness + a.popularity / 1000))

  return items.slice(0, 10)
}

export default async function handler(req, res) {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'Missing q parameter' })

  const { NUTRITIONIX_APP_ID, NUTRITIONIX_APP_KEY } = process.env

  try {
    let items, source
    if (NUTRITIONIX_APP_ID && NUTRITIONIX_APP_KEY) {
      items = await searchNutritionix(q, NUTRITIONIX_APP_ID, NUTRITIONIX_APP_KEY)
      source = 'nutritionix'
    } else {
      items = await searchOpenFoodFacts(q)
      source = 'openfoodfacts'
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json({ items, source })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
