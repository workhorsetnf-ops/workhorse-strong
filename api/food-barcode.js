// Barcode lookup through fatsecret. Needs the Premier Free tier (barcode scope);
// until that's approved, or if the product isn't in fatsecret, this answers
// { item: null } and the app falls back to Open Food Facts on its own.
import { fatsecretConfigured, barcodeFatsecret } from './_fatsecret.js'

export default async function handler(req, res) {
  const code = String(req.query.code || '').trim()
  if (!code) return res.status(400).json({ error: 'Missing code parameter' })
  if (!fatsecretConfigured()) return res.status(200).json({ item: null, reason: 'fatsecret not configured' })

  try {
    const item = await barcodeFatsecret(code)
    if (item) res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json({ item, source: item ? 'fatsecret' : null })
  } catch (err) {
    console.error('[food-barcode] fatsecret failed:', err.message)
    return res.status(200).json({ item: null, reason: err.message })
  }
}
