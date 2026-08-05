// Vercel serverless function — runs on Vercel's servers, not in the browser,
// so it isn't subject to the CORS restriction that blocks a direct browser
// call to Open Food Facts' beta search API. Deploys automatically because
// it's in /api — no extra setup, same `git push` as everything else.

export default async function handler(req, res) {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'Missing q parameter' })

  try {
    const url = 'https://search.openfoodfacts.org/search?page_size=10&langs=en&q=' + encodeURIComponent(q)
    const offRes = await fetch(url, {
      headers: { 'User-Agent': 'WorkhorseStrong/1.0 (coaching app; contact via app)' },
    })
    if (!offRes.ok) {
      return res.status(502).json({ error: `Open Food Facts returned HTTP ${offRes.status}` })
    }
    const data = await offRes.json()
    const rawItems = data.hits || data.products || []

    const items = rawItems.map(raw => {
      try {
        const pr = raw.document || raw._source || raw
        const nutr = pr.nutriments || {}
        const brandsField = pr.brands
        return {
          id: pr.code || pr.id || null,
          name: pr.product_name || pr.product_name_en || null,
          brand: Array.isArray(brandsField) ? (brandsField[0] || '') : String(brandsField || '').split(',')[0],
          p: +nutr.proteins_100g || 0,
          c: +nutr.carbohydrates_100g || 0,
          f: +nutr.fat_100g || 0,
        }
      } catch {
        return null
      }
    }).filter(it => it && it.name && (it.p || it.c || it.f))

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json({ items })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
