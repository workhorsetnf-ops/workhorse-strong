import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr } from '../../lib/weeks'
import NutritionTabs from './NutritionTabs'
import { mondayOf, weekDaysFrom } from '../../lib/weeks'
import { MEAL_SLOTS, weekTable, planMealToLogs } from '../../lib/foodlog'
import { itemMacros, sumMacros, targetsFrom } from '../../lib/mealplan'
import { WeekTotals, DayLog } from '../coach/FoodLogViews'

const slotForNow = () => { const h = new Date().getHours(); return h < 10 ? 'Breakfast' : h < 14 ? 'Lunch' : h < 17 ? 'Snack' : 'Dinner' }

export default function ClientNutrition() {
  const { profile } = useAuth()
  const [meals, setMeals] = useState([])
  const [form, setForm] = useState({ meal_name: '', protein_g: '', carbs_g: '', fat_g: '' })
  const [foodQ, setFoodQ] = useState('')
  const [foodResults, setFoodResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selFood, setSelFood] = useState(null)
  const [grams, setGrams] = useState('100')
  const [source, setSource] = useState('')
  const [loadingCommon, setLoadingCommon] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const today = localDateStr()   // local, not UTC — see ClientTraining
  const week = weekDaysFrom(mondayOf(today))
  const [slot, setSlot] = useState(slotForNow())
  const [weekLogs, setWeekLogs] = useState([])
  const [plan, setPlan] = useState({ meals: [], items: [], plan: null, me: null })

  async function load() {
    const { data } = await supabase.from('meal_logs').select('*')
      .eq('client_id', profile.id).eq('logged_on', today).order('logged_at')
    setMeals(data || [])
    const { data: wk } = await supabase.from('meal_logs').select('*').eq('client_id', profile.id).gte('logged_on', week[0]).lte('logged_on', week[6])
    setWeekLogs(wk || [])
  }
  async function loadPlan() {
    const [{ data: me }, { data: pl }, { data: pm }, { data: pi }] = await Promise.all([
      supabase.from('profiles').select('protein_g, carbs_g, fat_g, calories').eq('id', profile.id).single(),
      supabase.from('meal_plans').select('*').eq('client_id', profile.id).maybeSingle(),
      supabase.from('meal_plan_meals').select('*').eq('client_id', profile.id).order('position'),
      supabase.from('meal_plan_items').select('*').eq('client_id', profile.id).order('position'),
    ])
    setPlan({ me: me || profile, plan: pl, meals: pm || [], items: pi || [] })
  }
  // One tap logs every food in that meal from the plan.
  async function logPlanMeal(m) {
    const rows = planMealToLogs(m, plan.items, { clientId: profile.id, date: today, itemMacros })
    if (!rows.length) return
    await supabase.from('meal_logs').insert(rows)
    load()
  }
  useEffect(() => { if (profile) { load(); loadPlan() } }, [profile])

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

  async function runSearch(q) {
    if (!q.trim()) { setFoodResults([]); return }
    setSearching(true); setDebugInfo('')
    try {
      const res = await fetch('/api/food-search?q=' + encodeURIComponent(q.trim()))
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch {
        setDebugInfo(`Search failed — HTTP ${res.status}. Response wasn't JSON: ${text.slice(0, 150)}`)
        setSearching(false)
        return
      }
      if (!res.ok) {
        setDebugInfo(`Search failed — HTTP ${res.status}. ${data.error || JSON.stringify(data).slice(0, 200)}`)
        setSearching(false)
        return
      }
      setFoodResults(data.items || [])
      setSource(data.source || '')
      if ((data.items || []).length === 0) setDebugInfo('No matching foods found for that search.')
    } catch (err) {
      setDebugInfo(`Search request failed entirely: ${err.message}`)
    }
    setSearching(false)
  }

  useEffect(() => {
    if (!foodQ.trim()) { setFoodResults([]); setDebugInfo(''); return }
    const t = setTimeout(() => runSearch(foodQ), 400)
    return () => clearTimeout(t)
  }, [foodQ])

  async function selectFood(item) {
    if (item.per === 'lookup') {
      setLoadingCommon(true)
      try {
        const res = await fetch('/api/food-nutrients?food=' + encodeURIComponent(item.name))
        const data = await res.json()
        if (!res.ok) { setDebugInfo(data.error || 'Could not look up that food.'); setLoadingCommon(false); return }
        setSelFood({ ...item, p: data.p, c: data.c, f: data.f, per: 'serving', servingQty: data.servingQty, servingUnit: data.servingUnit })
        setGrams('1')
      } catch (err) {
        setDebugInfo('Lookup failed: ' + err.message)
      }
      setLoadingCommon(false)
    } else {
      setSelFood(item)
      setGrams(item.per === 'serving' ? '1' : '100')
    }
    setFoodResults([]); setFoodQ('')
  }

  async function addFood() {
    if (!selFood || !+grams) return
    const isServing = selFood.per === 'serving'
    const factor = isServing ? +grams : (+grams / 100)
    const label = isServing
      ? `${selFood.name}${selFood.brand ? ` (${selFood.brand})` : ''} — ${grams}× serving`
      : `${selFood.name}${selFood.brand ? ` (${selFood.brand})` : ''} — ${grams}g`
    await supabase.from('meal_logs').insert({
      client_id: profile.id,
      logged_on: localDateStr(),   // the DB default is the server's UTC date
      meal_name: label, meal: slot, grams: isServing ? null : +grams,
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
      client_id: profile.id, logged_on: localDateStr(), meal_name: form.meal_name, meal: slot,
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
      <NutritionTabs />
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

      {plan.meals.length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="eyebrow">From your meal plan · one tap logs the whole meal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {plan.meals.map((m, i) => {
              const done = meals.some(l => l.meal === m.label)
              const k = Math.round(sumMacros(plan.items.filter(it => it.meal_id === m.id)).kcal)
              return (
                <button key={m.id} type="button" onClick={() => (done && !window.confirm(`${m.label} is already logged today. Log it again?`) ? null : logPlanMeal(m))}
                  style={{ textAlign: 'left', padding: '10px 10px', borderRadius: 10, cursor: 'pointer', font: 'inherit', color: 'inherit',
                    border: '1px solid ' + (done ? 'var(--orange)' : 'var(--line)'), background: done ? 'rgba(255,106,0,0.14)' : 'var(--steel)' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--orange-hot)' }}>{i + 1} · {done ? 'LOGGED ✓' : 'TAP TO LOG'}</div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginTop: 2 }}>{m.label}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{k.toLocaleString()} kcal</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px' }}>
        <span className="eyebrow" style={{ fontSize: 10, margin: 0 }}>Logging to</span>
        <select value={slot} onChange={e => setSlot(e.target.value)} aria-label="Meal" style={{ flex: 1 }}>
          {MEAL_SLOTS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="eyebrow">Search foods</div>
        <div style={{ position: 'relative' }}>
          <input placeholder="Start typing — e.g. chicken breast, greek yogurt, Quest bar" value={foodQ}
            onChange={e => { setFoodQ(e.target.value); setSelFood(null) }} />
          {searching && <span className="muted" style={{ position: 'absolute', right: 10, top: 12, fontSize: 12 }}>Searching…</span>}
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
                onClick={() => selectFood(it)}>
                <strong>{it.name}</strong>{it.brand ? ` · ${it.brand}` : ''}
                <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>
                  {it.per === 'lookup'
                    ? 'Tap to look up macros'
                    : it.per === 'serving'
                      ? `per ${it.servingQty ? `${it.servingQty} ${it.servingUnit || 'serving'}` : 'serving'}: P ${Math.round(it.p)} · C ${Math.round(it.c)} · F ${Math.round(it.f)}`
                      : `per 100g: P ${Math.round(it.p)} · C ${Math.round(it.c)} · F ${Math.round(it.f)}`}
                </span>
              </button>
            ))}
          </div>
        )}
        {loadingCommon && <p className="muted" style={{ fontSize: 12.5 }}>Looking up nutrients…</p>}
        {selFood && (
          <div style={{ background: 'var(--steel)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{selFood.name}{selFood.brand ? ` · ${selFood.brand}` : ''}</div>
            {selFood.per === 'serving' ? (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 13 }}>{selFood.servingQty ? `${selFood.servingQty} ${selFood.servingUnit || 'serving'}` : '1 serving'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto' }}>
                    P {Math.round(selFood.p)} · C {Math.round(selFood.c)} · F {Math.round(selFood.f)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[0.5, 1, 1.5, 2].map(mult => (
                    <button key={mult} className={grams === String(mult) ? 'btn' : 'btn-ghost'} style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => setGrams(String(mult))}>{mult}×</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  <input inputMode="numeric" style={{ width: 90 }} value={grams} onChange={e => setGrams(e.target.value)} />
                  <span className="muted" style={{ fontSize: 13 }}>grams</span>
                  <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto' }}>
                    P {Math.round(selFood.p * (+grams || 0) / 100)} · C {Math.round(selFood.c * (+grams || 0) / 100)} · F {Math.round(selFood.f * (+grams || 0) / 100)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[50, 100, 150, 200].map(g => (
                    <button key={g} className={grams === String(g) ? 'btn' : 'btn-ghost'} style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => setGrams(String(g))}>{g}g</button>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn" style={{ padding: '8px 16px', fontSize: 12 }} onClick={addFood}>Add to log</button>
              <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setSelFood(null)}>Back</button>
            </div>
          </div>
        )}
        {foodResults.length === 0 && foodQ && !searching && !selFood && (
          <p className="muted" style={{ fontSize: 12.5 }}>No results yet — keep typing, or log it manually below.</p>
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

      <div>
        <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8, color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em' }}>TODAY'S FOOD LOG</div>
        <DayLog logs={meals} onRemove={removeMeal} />
      </div>

      <div>
        <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8, color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em' }}>THIS WEEK · DAILY TOTALS</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <WeekTotals compact today={today} table={weekTable(weekLogs, week, targetsFrom(plan.me || profile, plan.plan), today)} targets={targetsFrom(plan.me || profile, plan.plan)} />
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>On target = calories within 5% and protein at 95%+ of your targets.</p>
      </div>
    </div>
  )
}
