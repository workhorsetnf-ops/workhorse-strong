// Shared fatsecret Platform API helpers. Files starting with "_" are not
// exposed as endpoints by Vercel.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   FATSECRET_CLIENT_ID      OAuth 2.0 Client ID from platform.fatsecret.com
//   FATSECRET_CLIENT_SECRET  OAuth 2.0 Client Secret (keep secret)
//
// fatsecret also requires the caller's IP to be whitelisted. Vercel has no
// fixed IP, so the account's IP Restrictions must allow 0.0.0.0/0 and ::/0.
// The keys never leave the server, which is what makes that safe.

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token'
const API_URL = 'https://platform.fatsecret.com/rest/server.api'

export function fatsecretConfigured() {
  return !!(process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET)
}

// Tokens last 24h. Warm serverless instances reuse this cache, so most
// requests skip the token call entirely.
const tokens = {} // scope -> { token, expires }

async function getToken(scope) {
  const hit = tokens[scope]
  if (hit && hit.expires > Date.now() + 60_000) return hit.token
  const { FATSECRET_CLIENT_ID: id, FATSECRET_CLIENT_SECRET: secret } = process.env
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(`fatsecret token (${scope}): ${data.error || 'HTTP ' + res.status}`)
  }
  tokens[scope] = { token: data.access_token, expires: Date.now() + (data.expires_in || 86400) * 1000 }
  return data.access_token
}

async function call(method, params, scope = 'basic') {
  const token = await getToken(scope)
  const qs = new URLSearchParams({ method, format: 'json', ...params })
  const res = await fetch(`${API_URL}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({}))
  // fatsecret reports most failures as HTTP 200 with an { error } body
  // (e.g. code 21 "Invalid IP address detected").
  if (!res.ok || data.error) {
    const e = data.error || {}
    throw new Error(`fatsecret ${method}: ${e.message || 'HTTP ' + res.status}${e.code ? ` (code ${e.code})` : ''}`)
  }
  return data
}

// fatsecret returns a single item as an object and several as an array.
const asArray = x => (Array.isArray(x) ? x : x ? [x] : [])

// Search results carry macros as text, e.g.
//   "Per 100g - Calories: 165kcal | Fat: 3.57g | Carbs: 0.00g | Protein: 31.02g"
//   "Per 1 bar - Calories: 200kcal | Fat: 8.00g | Carbs: 22.00g | Protein: 20.00g"
// Gram-based entries are normalised to per-100g so the app's gram picker works;
// everything else stays per-serving.
export function parseDescription(desc) {
  if (!desc) return null
  const m = /^Per\s+(.+?)\s+-\s+(.*)$/i.exec(desc.trim())
  if (!m) return null
  const portion = m[1].trim()
  const num = key => {
    const r = new RegExp(key + ':\\s*([\\d.]+)', 'i').exec(m[2])
    return r ? +r[1] : null
  }
  const p = num('Protein'), c = num('Carbs'), f = num('Fat')
  if (p == null && c == null && f == null) return null
  const grams = /^([\d.]+)\s*g$/i.exec(portion)
  if (grams && +grams[1] > 0) {
    const k = 100 / +grams[1]
    return { per: '100g', p: (p || 0) * k, c: (c || 0) * k, f: (f || 0) * k }
  }
  const qty = /^([\d./]+)\s+(.+)$/.exec(portion)
  return {
    per: 'serving',
    servingQty: qty ? qty[1] : null,
    servingUnit: qty ? qty[2] : portion,
    p: p || 0, c: c || 0, f: f || 0,
  }
}

export async function searchFatsecret(q) {
  const data = await call('foods.search', { search_expression: q, max_results: '20' })
  const foods = asArray(data.foods?.food)
  const seen = new Set()
  const items = []
  for (const fd of foods) {
    const parsed = parseDescription(fd.food_description)
    if (!parsed || !(parsed.p || parsed.c || parsed.f)) continue
    const brand = fd.brand_name || ''
    const key = (fd.food_name + '|' + brand).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ id: 'fs-' + fd.food_id, name: fd.food_name, brand, ...parsed })
  }
  return items.slice(0, 12)
}

// Pick the most useful serving from a food.get result: a gram-measured one
// becomes per-100g; otherwise the default (or first) serving is used as-is.
export function servingToItem(food) {
  const servings = asArray(food?.servings?.serving)
  if (!servings.length) return null
  const base = { id: 'fs-' + food.food_id, name: food.food_name, brand: food.brand_name || '' }
  const gram = servings.find(s => s.metric_serving_unit === 'g' && +s.metric_serving_amount > 0)
  if (gram) {
    const k = 100 / +gram.metric_serving_amount
    return { ...base, per: '100g', p: +gram.protein * k || 0, c: +gram.carbohydrate * k || 0, f: +gram.fat * k || 0 }
  }
  const s = servings.find(x => x.is_default === '1') || servings[0]
  const qty = /^([\d./]+)\s+(.+)$/.exec(s.serving_description || '')
  return {
    ...base, per: 'serving',
    servingQty: qty ? qty[1] : null, servingUnit: qty ? qty[2] : (s.serving_description || 'serving'),
    p: +s.protein || 0, c: +s.carbohydrate || 0, f: +s.fat || 0,
  }
}

// fatsecret wants a 13-digit GTIN; UPC-A (12 digits) and EAN-8 are zero-padded.
export function toGtin13(code) {
  const d = String(code || '').replace(/\D/g, '')
  if (d.length === 12 || d.length === 8) return d.padStart(13, '0')
  if (d.length === 13) return d
  return null
}

// Barcode lookup needs the "barcode" scope, which comes with Premier Free.
// On the Basic tier the token request is refused and the caller falls back.
export async function barcodeFatsecret(code) {
  const gtin = toGtin13(code)
  if (!gtin) return null
  const found = await call('food.find_id_for_barcode', { barcode: gtin }, 'basic barcode')
  const foodId = found.food_id?.value ?? found.food_id
  if (!foodId || foodId === '0') return null
  const detail = await call('food.get', { food_id: String(foodId) }, 'basic')
  return servingToItem(detail.food)
}
