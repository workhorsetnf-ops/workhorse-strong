import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { shoppingList } from '../../lib/mealplan'
import { ShoppingTable } from '../coach/MealPlanView'
import NutritionTabs from './NutritionTabs'

const DEFAULT_EXTRAS = ['Seasonings / hot sauce', 'Zero-calorie drinks', 'Cooking spray', 'Meal prep containers'].map(name => ({ name, got: false }))

export default function ClientShopping() {
  const { profile } = useAuth()
  const [items, setItems] = useState(null)
  const [list, setList] = useState({ days: 7, checked: [], extras: DEFAULT_EXTRAS })
  const [newExtra, setNewExtra] = useState('')
  const saveTimer = useRef(null)
  const pending = useRef(null)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('meal_plan_items').select('food_name, category, grams').eq('client_id', profile.id),
      supabase.from('shopping_lists').select('*').eq('client_id', profile.id).maybeSingle(),
    ]).then(([{ data: it }, { data: s }]) => {
      setItems(it || [])
      if (s) setList({ days: s.days, checked: s.checked || [], extras: s.extras || [] })
    })
  }, [profile])

  // Save shortly after each change so quick taps in the store batch into one write.
  function update(next) {
    setList(next)
    pending.current = next
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 400)
  }
  function flush() {
    const next = pending.current
    if (!next || !profile) return
    pending.current = null
    supabase.from('shopping_lists').upsert({ client_id: profile.id, days: next.days, checked: next.checked, extras: next.extras, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
  }
  // leaving the page mid-wait still saves the last tap
  useEffect(() => () => { clearTimeout(saveTimer.current); flush() } /* eslint-disable-next-line react-hooks/exhaustive-deps */, [])

  const rows = items ? shoppingList(items, list.days) : []
  const toggle = key => update({ ...list, checked: list.checked.includes(key) ? list.checked.filter(k => k !== key) : [...list.checked, key] })
  const gotCount = rows.filter(r => list.checked.includes(r.key)).length + list.extras.filter(e => e.got).length
  const total = rows.length + list.extras.length
  const setDays = d => update({ ...list, days: Math.min(31, Math.max(1, d)) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <NutritionTabs />
      <header>
        <div className="eyebrow">This week</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Shopping List</h1>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Built from your meal plan. Tick items as they go in the cart.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
        <div className="card" style={{ padding: '10px 10px', borderTop: '3px solid var(--orange)', textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em' }}>SHOPPING FOR</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            <button className="btn-ghost" aria-label="Fewer days" onClick={() => setDays(list.days - 1)} style={{ padding: '2px 10px', fontSize: 16 }}>−</button>
            <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--orange-hot)', minWidth: 70 }}>{list.days} days</span>
            <button className="btn-ghost" aria-label="More days" onClick={() => setDays(list.days + 1)} style={{ padding: '2px 10px', fontSize: 16 }}>+</button>
          </div>
        </div>
        <div className="card" style={{ padding: '10px 10px', borderTop: '3px solid var(--orange)', textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em' }}>GOT</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{gotCount} / {total}</div>
        </div>
      </div>

      {items && rows.length === 0 && <div className="card muted" style={{ fontSize: 14 }}>Your list fills in once your coach builds your meal plan.</div>}
      {rows.length > 0 && <div className="card" style={{ padding: 0 }}><ShoppingTable rows={rows} checked={list.checked} onToggle={toggle} compact /></div>}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>Extras</div>
        {list.extras.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" aria-label={`Got ${e.name}`} aria-pressed={e.got} onClick={() => update({ ...list, extras: list.extras.map((x, k) => (k === i ? { ...x, got: !x.got } : x)) })}
              style={{ width: 28, height: 28, padding: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 900, color: '#000', background: e.got ? 'var(--orange)' : 'transparent', border: '1.5px solid ' + (e.got ? 'var(--orange)' : 'var(--line)'), flexShrink: 0 }}>{e.got ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 14, color: e.got ? 'var(--muted)' : undefined, textDecoration: e.got ? 'line-through' : 'none' }}>{e.name}</span>
            <button aria-label={`Remove ${e.name}`} onClick={() => update({ ...list, extras: list.extras.filter((_, k) => k !== i) })} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        ))}
        <form onSubmit={e => { e.preventDefault(); const n = newExtra.trim(); if (n) { update({ ...list, extras: [...list.extras, { name: n, got: false }] }); setNewExtra('') } }} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input value={newExtra} onChange={e => setNewExtra(e.target.value)} placeholder="Add something else…" style={{ fontSize: 14 }} />
          <button className="btn-ghost" type="submit" style={{ padding: '6px 12px' }}>Add</button>
        </form>
      </div>

      {(gotCount > 0) && (
        <button className="btn-ghost" onClick={() => update({ ...list, checked: [], extras: list.extras.map(x => ({ ...x, got: false })) })} style={{ alignSelf: 'flex-start', fontSize: 12.5 }}>Start a new shop (clear ticks)</button>
      )}
      <p className="muted" style={{ fontSize: 11 }}>Totals are cooked or as-listed weights. Buy a little extra for raw-to-cooked loss on meats and rice.</p>
    </div>
  )
}
