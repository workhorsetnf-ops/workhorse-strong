import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientNutrition() {
  const { profile } = useAuth()
  const [meals, setMeals] = useState([])
  const [form, setForm] = useState({ meal_name: '', protein_g: '', carbs_g: '', fat_g: '' })
  const [foodQ, setFoodQ] = useState('')
  const [foodResults, setFoodResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selFood, setSelFood] = useState(null)
  const [grams, setGrams] = useState('100')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const today = new Date().toISOString().slice(0, 10)

  async function load() {
    const { data } = await supabase.from('meal_logs').select('*')
      .eq('client_id', profile.id).eq('logged_on', today).order('logged_at')
    setMeals(data || [])
  }
  useEffect(() => { if (profile) load() }, [profile])

  async function lookupBarcode(code) {
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`)
      const data = await res.json()
      if (data.status !== 1) { setScanError("Couldn't find that product — try searching by name instead."); return }
      const pr = data.product
      setSelFood({
        id: code, name: pr.product_name || 'Scanned item', brand: (pr.brands || '').split(',')[0],
        p: +pr.nutriments?.proteins_100g || 0, c: +pr.nutriments?.carbohydrates_100g || 0, f: +pr.nutriments?.fat_100g || 0,
      })
      setFoodResults([]); setFoodQ('')
    } catch {
      setScanError('Lookup failed — check your connection and try again.')
    }
  }

  async function startScan() {
    setScanError('')
    if (!('BarcodeDetector' in window)) {
      setScanError("Barcode scanning isn't supported in this browser yet — Safari/iPhone doesn't have it. Search by name instead, or try Chrome on Android.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setScanning(true)
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream }, 50)
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0) {
            stopScan()
            lookupBarcode(codes[0].rawValue)
            return
          }
        } catch {}
        if (streamRef.current) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } catch {
      setScanError('Could not access your camera — check browser permissions.')
    }
  }

  function stopScan() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  async function searchFood() {
    if (!foodQ.trim()) return
    setSearching(true); setFoodResults([]); setSelFood(null); setDebugInfo('')
    try {
      const targetUrl = 'https://search.openfoodfacts.org/search?page_size=10&langs=en&q=' + encodeURIComponent(foodQ.trim())
      // search-a-licious (OFF's beta search API) doesn't send browser CORS headers yet,
      // so we route through a pass-through proxy that does — same data, just relayed.
      const url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl)
      const res = await fetch(url)
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch {
        setDebugInfo(`Search failed — HTTP ${res.status}. Response wasn't JSON: ${text.slice(0, 150)}`)
        setSearching(false)
        return
      }
      if (!res.ok) {
        setDebugInfo(`Search failed — HTTP ${res.status}. ${JSON.stringify(data).slice(0, 200)}`)
        setSearching(false)
        return
      }
      const rawItems = data.hits || data.products || []
      const items = rawItems
        .map(raw => {
          const pr = raw.document || raw._source || raw
          const nutr = pr.nutriments || {}
          return {
            id: pr.code || pr.id,
            name: pr.product_name || pr.product_name_en || 'Unknown',
            brand: (pr.brands || '').split(',')[0],
            p: +nutr.proteins_100g || 0,
            c: +nutr.carbohydrates_100g || 0,
            f: +nutr.fat_100g || 0,
          }
        })
        .filter(it => it.name !== 'Unknown' && (it.p || it.c || it.f))
      setFoodResults(items)
      if (items.length === 0) {
        setDebugInfo(`Got a response but found 0 usable results. Raw item count: ${rawItems.length}. Sample: ${JSON.stringify(rawItems[0] || data).slice(0, 250)}`)
      }
    } catch (err) {
      setDebugInfo(`Search request failed entirely: ${err.message}`)
    }
    setSearching(false)
  }

  async function addFood() {
    if (!selFood || !+grams) return
    const factor = +grams / 100
    await supabase.from('meal_logs').insert({
      client_id: profile.id,
      meal_name: `${selFood.name}${selFood.brand ? ` (${selFood.brand})` : ''} — ${+grams}g`,
      protein_g: Math.round(selFood.p * factor),
      carbs_g: Math.round(selFood.c * factor),
      fat_g: Math.round(selFood.f * factor),
    })
    setSelFood(null); setFoodQ(''); setFoodResults([]); setGrams('100')
    load()
  }

  async function addMeal() {
    if (!form.meal_name) return
    await supabase.from('meal_logs').insert({
      client_id: profile.id, meal_name: form.meal_name,
      protein_g: +form.protein_g || 0, carbs_g: +form.carbs_g || 0, fat_g: +form.fat_g || 0
    })
    setForm({ meal_name: '', protein_g: '', carbs_g: '', fat_g: '' })
    load()
  }

  async function removeMeal(id) {
    await supabase.from('meal_logs').delete().eq('id', id)
    load()
  }

  const totals = meals.reduce((a, m) => ({
    p: a.p + m.protein_g, c: a.c + m.carbs_g, f: a.f + m.fat_g
  }), { p: 0, c: 0, f: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Nutrition</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Today</h1>
      </header>

      <div className="card">
        {[['Protein', totals.p, profile?.protein_g], ['Carbs', totals.c, profile?.carbs_g], ['Fat', totals.f, profile?.fat_g]].map(([label, val, target]) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 5 }}>
              <span>{label}</span><span className="muted">{val} / {target || 0} g</span>
            </div>
            <div className="bar-track">
              <div className={`bar-fill${target && val > target ? ' over' : ''}`} style={{ width: `${target ? Math.min(100, val / target * 100) : 0}%` }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
          {totals.p * 4 + totals.c * 4 + totals.f * 9} <span className="muted">/ {profile?.calories || 0} kcal</span>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="eyebrow">Search foods</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="e.g. chicken breast, greek yogurt, Quest bar" value={foodQ}
            onChange={e => setFoodQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchFood()} />
          <button className="btn" style={{ padding: '12px 16px', whiteSpace: 'nowrap' }} onClick={searchFood} disabled={searching}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {!scanning ? (
          <button className="btn-ghost" onClick={startScan}>📷 Scan a barcode</button>
        ) : (
          <div>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, maxHeight: 240, objectFit: 'cover' }} />
            <button className="btn-ghost" style={{ marginTop: 6, width: '100%' }} onClick={stopScan}>Cancel scan</button>
          </div>
        )}
        {scanError && <p style={{ color: 'var(--red)', fontSize: 12.5 }}>{scanError}</p>}
        {foodResults.length > 0 && !selFood && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {foodResults.map(it => (
              <button key={it.id} className="btn-ghost" style={{ textAlign: 'left', fontSize: 13, padding: '8px 10px' }}
                onClick={() => setSelFood(it)}>
                <strong>{it.name}</strong>{it.brand ? ` · ${it.brand}` : ''}
                <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>
                  per 100g: P {it.p.toFixed(0)} · C {it.c.toFixed(0)} · F {it.f.toFixed(0)}
                </span>
              </button>
            ))}
          </div>
        )}
        {selFood && (
          <div style={{ background: 'var(--steel)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{selFood.name}{selFood.brand ? ` · ${selFood.brand}` : ''}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input inputMode="numeric" style={{ width: 90 }} value={grams} onChange={e => setGrams(e.target.value)} />
              <span className="muted" style={{ fontSize: 13 }}>grams</span>
              <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto' }}>
                P {Math.round(selFood.p * (+grams || 0) / 100)} · C {Math.round(selFood.c * (+grams || 0) / 100)} · F {Math.round(selFood.f * (+grams || 0) / 100)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn" style={{ padding: '8px 16px', fontSize: 12 }} onClick={addFood}>Add to log</button>
              <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setSelFood(null)}>Back</button>
            </div>
          </div>
        )}
        {foodResults.length === 0 && foodQ && !searching && !selFood && (
          <p className="muted" style={{ fontSize: 12.5 }}>No results yet — search, or log it manually below.</p>
        )}
        {debugInfo && (
          <div style={{ background: 'rgba(214,69,69,0.12)', border: '1px solid var(--red)', borderRadius: 6, padding: 8, fontSize: 11, color: 'var(--red)', wordBreak: 'break-word' }}>
            {debugInfo}
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="eyebrow">Log a meal manually</div>
        <input placeholder="Meal (e.g. Chicken, rice, broccoli)" value={form.meal_name} onChange={e => setForm({ ...form, meal_name: e.target.value })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <input inputMode="numeric" placeholder="P (g)" value={form.protein_g} onChange={e => setForm({ ...form, protein_g: e.target.value })} />
          <input inputMode="numeric" placeholder="C (g)" value={form.carbs_g} onChange={e => setForm({ ...form, carbs_g: e.target.value })} />
          <input inputMode="numeric" placeholder="F (g)" value={form.fat_g} onChange={e => setForm({ ...form, fat_g: e.target.value })} />
        </div>
        <button className="btn" onClick={addMeal} disabled={!form.meal_name}>Add meal</button>
      </div>

      {meals.map(m => (
        <div className="card" key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px' }}>
          <div>
            <strong style={{ fontSize: 14.5 }}>{m.meal_name}</strong>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>P {m.protein_g} · C {m.carbs_g} · F {m.fat_g}</div>
          </div>
          <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => removeMeal(m.id)}>Remove</button>
        </div>
      ))}
    </div>
  )
}
