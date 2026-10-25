import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Utensils, ShoppingCart, Trash2, Plus, NotebookPen, Calculator } from 'lucide-react'
import { CoachFoodLog, MacroCalculator } from './CoachFoodLog'
import { supabase } from '../../lib/supabase'
import { itemMacros, sumMacros, targetsFrom, STARTER_PLAN, fromFood, shoppingList, fmt0, fmt1, scaleToTargets } from '../../lib/mealplan'
import { PlanTargets, ShoppingTable } from './MealPlanView'
import FoodPicker from './FoodPicker'

const DISPLAY_FONT = "'Oswald','Barlow',system-ui,sans-serif"

export default function CoachNutrition() {
  const { clientId } = useParams()
  const [tab, setTab] = useState('plan')
  const [client, setClient] = useState(null)
  const [plan, setPlan] = useState(null)
  const [meals, setMeals] = useState([])
  const [items, setItems] = useState([])
  const [library, setLibrary] = useState([])
  const [shop, setShop] = useState(null)
  const [draft, setDraft] = useState({})
  const [adding, setAdding] = useState({})   // mealId -> food text being typed
  const [busy, setBusy] = useState(0)
  const [missing, setMissing] = useState(false)
  const [tg, setTg] = useState(null)          // targets being edited

  async function load() {
    const [{ data: c }, { data: p, error }, { data: m }, { data: it }, { data: lib }, { data: s }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).single(),
      supabase.from('meal_plans').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('meal_plan_meals').select('*').eq('client_id', clientId).order('position').order('created_at'),
      supabase.from('meal_plan_items').select('*').eq('client_id', clientId).order('position').order('created_at'),
      supabase.from('food_library').select('*').order('name'),
      supabase.from('shopping_lists').select('*').eq('client_id', clientId).maybeSingle(),
    ])
    setMissing(!!error && /meal_plans/.test(error.message || ''))
    setClient(c); setPlan(p); setMeals(m || []); setItems(it || []); setLibrary(lib || []); setShop(s)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId])

  async function run(fn) { setBusy(b => b + 1); try { await fn() } finally { setBusy(b => b - 1) } }
  const findFood = name => library.find(f => f.name.toLowerCase() === String(name).trim().toLowerCase())
  const touchPlan = () => supabase.from('meal_plans').upsert({ client_id: clientId, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })

  // ---------- meals ----------
  async function addMeal(label = `Meal ${meals.length + 1}`) {
    await run(async () => { await touchPlan(); await supabase.from('meal_plan_meals').insert({ client_id: clientId, label, position: meals.length }); await load() })
  }
  // The sheet's sample day, with grams scaled to THIS client's targets so it
  // starts on target instead of at the sample's 2,445 kcal.
  async function startFromSheet() {
    await run(async () => {
      await touchPlan()
      const t = targetsFrom(client, plan)
      const lines = STARTER_PLAN.flatMap((sm, i) => sm.items.map(([name, grams, note], k) => {
        const f = findFood(name)
        return { meal: i, grams, note, position: k, ...(f ? fromFood(f) : { food_name: name, category: 'Other', protein100: 0, carbs100: 0, fat100: 0, fiber100: 0 }) }
      }))
      const scaled = t.p && t.c && t.f ? scaleToTargets(lines, t) : lines
      for (let i = 0; i < STARTER_PLAN.length; i++) {
        const sm = STARTER_PLAN[i]
        const id = crypto.randomUUID()
        await supabase.from('meal_plan_meals').insert({ id, client_id: clientId, label: sm.label, swap: sm.swap, position: meals.length + i })
        const rows = scaled.filter(l => l.meal === i).map(({ meal, ...l }) => ({ ...l, meal_id: id, client_id: clientId }))
        await supabase.from('meal_plan_items').insert(rows)
      }
      await load()
    })
  }
  async function patchMeal(m, field, v) {
    if (String(m[field] ?? '') === v || (field === 'label' && !v)) return
    setMeals(list => list.map(x => (x.id === m.id ? { ...x, [field]: v } : x)))
    await run(async () => { await supabase.from('meal_plan_meals').update({ [field]: v }).eq('id', m.id) })
  }
  async function moveMeal(m, dir) {
    const i = meals.findIndex(x => x.id === m.id), j = i + dir
    if (j < 0 || j >= meals.length) return
    const list = [...meals];[list[i], list[j]] = [list[j], list[i]]
    setMeals(list)
    await run(async () => { await Promise.all(list.map((x, k) => supabase.from('meal_plan_meals').update({ position: k }).eq('id', x.id))) })
  }
  async function removeMeal(m) {
    if (!window.confirm(`Delete ${m.label} and every food in it?`)) return
    await run(async () => { await supabase.from('meal_plan_meals').delete().eq('id', m.id); await load() })
  }

  // ---------- foods in a meal ----------
  // Re-read the library when the food box gets focus, so foods added since the
  // page opened (Library → Foods, or a SQL import) show up without a reload.
  async function refreshLibrary() {
    const { data } = await supabase.from('food_library').select('*').order('name')
    if (data) setLibrary(data)
  }
  async function addItem(m, picked) {
    const text = (picked ? picked.name : adding[m.id] || '').trim()
    if (!text) return
    const f = picked || findFood(text)
    if (!f && !window.confirm(`"${text}" isn't in your food library, so its macros will show as 0. Add it anyway? (Add it under Library → Foods to get the numbers.)`)) return
    const n = items.filter(it => it.meal_id === m.id).length
    setAdding(a => ({ ...a, [m.id]: '' }))
    await run(async () => {
      await touchPlan()
      await supabase.from('meal_plan_items').insert({ meal_id: m.id, client_id: clientId, grams: 100, position: n, ...(f ? fromFood(f) : { food_name: text }) })
      await load()
    })
  }
  // Re-solve the grams of the plan as it stands so it lands on the client's targets.
  async function refitPlan() {
    const t = targetsFrom(client, plan)
    if (!(t.p && t.c && t.f) || !items.length) return
    if (!window.confirm(`Adjust the grams in this plan to hit ${t.p} P / ${t.c} C / ${t.f} F? Foods and notes stay the same.`)) return
    const scaled = scaleToTargets(items, t)
    const changed = scaled.filter((l, i) => Number(l.grams) !== Number(items[i].grams))
    if (!changed.length) return
    setItems(scaled)
    await run(async () => {
      for (const l of changed) await supabase.from('meal_plan_items').update({ grams: l.grams }).eq('id', l.id)
      await touchPlan()
      await load()
    })
  }
  async function patchItem(it, field, raw) {
    let patch
    if (field === 'food_name') {
      const name = raw.trim()
      if (!name || name === it.food_name) return
      const f = findFood(name)
      patch = f ? fromFood(f) : { food_name: name, food_id: null }
    } else if (field === 'grams') {
      const g = Number(raw)
      if (raw === '' || Number.isNaN(g) || g < 0 || g === Number(it.grams)) return
      patch = { grams: g }
    } else {
      if ((it[field] ?? '') === raw) return
      patch = { [field]: raw }
    }
    setItems(list => list.map(x => (x.id === it.id ? { ...x, ...patch } : x)))
    await run(async () => {
      const { error } = await supabase.from('meal_plan_items').update(patch).eq('id', it.id)
      if (error) { alert('Save failed: ' + error.message); load() }
    })
  }
  async function removeItem(it) {
    setItems(list => list.filter(x => x.id !== it.id))
    await run(async () => { await supabase.from('meal_plan_items').delete().eq('id', it.id) })
  }

  // ---------- targets ----------
  async function saveTargets() {
    const p = Number(tg.p) || 0, c = Number(tg.c) || 0, f = Number(tg.f) || 0
    await run(async () => {
      await supabase.from('profiles').update({ protein_g: p, carbs_g: c, fat_g: f, calories: p * 4 + c * 4 + f * 9 }).eq('id', clientId)
      await supabase.from('meal_plans').upsert({ client_id: clientId, fiber_target: Number(tg.fi) || 0, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
      setTg(null); await load()
    })
  }

  const field = (key, value, onSave, opts = {}) => (
    <input value={key in draft ? draft[key] : value} list={opts.list} inputMode={opts.mode} placeholder={opts.ph} aria-label={opts.label}
      onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
      onBlur={() => { if (key in draft) { onSave(String(draft[key])); setDraft(d => { const n = { ...d }; delete n[key]; return n }) } }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ padding: '6px 7px', fontSize: 13, background: 'transparent', ...opts.style }} />
  )

  if (missing) return <div className="card" style={{ color: 'var(--red)' }}>Meal plans need the Update 93 SQL (migration_update93_meal_plan.sql) run in Supabase first.</div>
  if (!client) return <p className="muted">Loading…</p>

  const targets = targetsFrom(client, plan)
  const totals = sumMacros(items)
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '3px 6px', borderTop: '1px solid var(--line)', fontSize: 13, textAlign: 'center', verticalAlign: 'middle' }
  const num = { ...td, fontWeight: 600 }
  const shopRows = shoppingList(items, shop?.days || 7)

  return (
    <div>
      <Link to="/coach/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 13 }}><ChevronLeft size={15} /> Back to Clients</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Nutrition</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>{client.full_name || 'Client'} <span style={{ color: 'var(--muted)', fontSize: 16 }}>· {String(client.phase || '').toUpperCase()}</span></h1>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{busy ? 'Saving…' : 'All changes saved'}</span>
      </div>
      <div style={{ height: 3, background: 'var(--orange)', borderRadius: 2, margin: '8px 0 16px' }} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={tab === 'plan' ? 'btn' : 'btn-ghost'} onClick={() => setTab('plan')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Utensils size={15} /> Meal Plan</button>
        <button className={tab === 'shop' ? 'btn' : 'btn-ghost'} onClick={() => setTab('shop')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={15} /> Shopping List</button>
        <button className={tab === 'log' ? 'btn' : 'btn-ghost'} onClick={() => setTab('log')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><NotebookPen size={15} /> Food Log</button>
        <button className={tab === 'calc' ? 'btn' : 'btn-ghost'} onClick={() => setTab('calc')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calculator size={15} /> Macro Calculator</button>
      </div>

      {tab === 'log' && <CoachFoodLog clientId={clientId} targets={targets} />}
      {tab === 'calc' && <MacroCalculator client={client} onApplied={load} />}

      {tab === 'plan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PlanTargets targets={targets} totals={totals} />
          {tg ? (
            <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
              {[['p', 'Protein (g)'], ['c', 'Carbs (g)'], ['f', 'Fat (g)'], ['fi', 'Fiber (g)']].map(([k, l]) => (
                <div key={k} style={{ width: 110 }}><label className="muted" style={{ fontSize: 11 }}>{l}</label><input inputMode="numeric" value={tg[k]} onChange={e => setTg({ ...tg, [k]: e.target.value })} /></div>
              ))}
              <span className="muted" style={{ fontSize: 12, paddingBottom: 10 }}>= {fmt0((Number(tg.p) || 0) * 4 + (Number(tg.c) || 0) * 4 + (Number(tg.f) || 0) * 9)} kcal</span>
              <button className="btn" onClick={saveTargets} style={{ padding: '9px 16px', fontSize: 13 }}>Save targets</button>
              <button className="btn-ghost" onClick={() => setTg(null)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-ghost" onClick={() => setTg({ p: targets.p, c: targets.c, f: targets.f, fi: targets.fi })} style={{ padding: '6px 12px', fontSize: 12.5 }}>Edit targets</button>
              {items.length > 0 && targets.p > 0 && targets.c > 0 && targets.f > 0 && (
                <button className="btn-ghost" onClick={refitPlan} style={{ padding: '6px 12px', fontSize: 12.5 }}>Re-fit grams to targets</button>
              )}
              <span className="muted" style={{ fontSize: 12 }}>Targets are the client's macros (same as on the Clients page). On target = within 5%; fiber just needs 90%.</span>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 56 }}>Meal</th><th style={{ ...th, textAlign: 'left' }}>Food</th><th style={th}>Serving (g)</th><th style={th}>Calories</th>
                  <th style={th}>Protein</th><th style={th}>Carbs</th><th style={th}>Fat</th><th style={th}>Fiber</th><th style={{ ...th, textAlign: 'left' }}>Notes</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {meals.length === 0 && (
                  <tr><td colSpan={10} style={{ ...td, padding: 18, textAlign: 'left' }}>
                    <span className="muted">No meals yet. </span>
                    <button className="btn" onClick={startFromSheet} style={{ padding: '7px 14px', fontSize: 13, marginLeft: 6 }}>Start from the sample day{targetsFrom(client, plan).p ? ' (scaled to their targets)' : ''}</button>
                    <button className="btn-ghost" onClick={() => addMeal('Breakfast')} style={{ padding: '7px 14px', fontSize: 13, marginLeft: 6 }}>Start blank</button>
                  </td></tr>
                )}
                {meals.map((m, mi) => {
                  const list = items.filter(it => it.meal_id === m.id).sort((a, b) => a.position - b.position)
                  const t = sumMacros(list)
                  return [
                    ...list.map((it, k) => {
                      const x = itemMacros(it)
                      const unknown = !it.food_id && !findFood(it.food_name)
                      return (
                        <tr key={it.id} style={{ background: k % 2 ? 'var(--steel)' : 'transparent' }}>
                          {k === 0 && (
                            <td rowSpan={list.length + 2} style={{ ...td, background: 'var(--steel)', borderTop: '2px solid var(--orange)', borderRight: '1px solid var(--orange)', verticalAlign: 'middle' }}>
                              <div style={{ fontFamily: DISPLAY_FONT, fontSize: 34, color: 'var(--orange-hot)', lineHeight: 1 }}>{mi + 1}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, alignItems: 'center' }}>
                                <button className="btn-ghost" aria-label={`Move ${m.label} up`} disabled={mi === 0} onClick={() => moveMeal(m, -1)} style={{ padding: '0 6px', fontSize: 11 }}>↑</button>
                                <button className="btn-ghost" aria-label={`Move ${m.label} down`} disabled={mi === meals.length - 1} onClick={() => moveMeal(m, 1)} style={{ padding: '0 6px', fontSize: 11 }}>↓</button>
                              </div>
                            </td>
                          )}
                          <td style={{ ...td, textAlign: 'left', minWidth: 220, borderTop: k === 0 ? '2px solid var(--orange)' : td.borderTop }}>
                            {field(`fn|${it.id}`, it.food_name, v => patchItem(it, 'food_name', v), { list: 'food-lib', label: `Food ${it.food_name}`, style: { fontWeight: 700, color: unknown ? '#ff8a80' : undefined } })}
                            {unknown && <div style={{ fontSize: 10.5, color: '#ff8a80', paddingLeft: 7 }}>Not in the food library: macros are 0</div>}
                          </td>
                          <td style={{ ...td, width: 96, borderTop: k === 0 ? '2px solid var(--orange)' : td.borderTop, borderRight: '1px solid var(--orange)' }}>
                            {field(`g|${it.id}`, String(it.grams), v => patchItem(it, 'grams', v), { mode: 'decimal', label: `${it.food_name} grams`, style: { textAlign: 'center', fontWeight: 800 } })}
                          </td>
                          <td style={{ ...num, color: 'var(--orange-hot)', fontWeight: 800, borderTop: k === 0 ? '2px solid var(--orange)' : td.borderTop }}>{fmt0(x.kcal)}</td>
                          {[x.p, x.c, x.f, x.fi].map((v, q) => <td key={q} style={{ ...num, borderTop: k === 0 ? '2px solid var(--orange)' : td.borderTop }}>{fmt1(v)}</td>)}
                          <td style={{ ...td, textAlign: 'left', minWidth: 200, borderTop: k === 0 ? '2px solid var(--orange)' : td.borderTop }}>
                            {field(`n|${it.id}`, it.note || '', v => patchItem(it, 'note', v.trim()), { ph: 'Note', label: `${it.food_name} note`, style: { fontStyle: 'italic', color: 'var(--muted)', fontSize: 12 } })}
                          </td>
                          <td style={{ ...td, width: 34, borderTop: k === 0 ? '2px solid var(--orange)' : td.borderTop }}>
                            <button aria-label={`Remove ${it.food_name}`} onClick={() => removeItem(it)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      )
                    }),
                    <tr key={m.id + 'add'}>
                      {list.length === 0 && (
                        <td rowSpan={2} style={{ ...td, background: 'var(--steel)', borderTop: '2px solid var(--orange)', borderRight: '1px solid var(--orange)' }}>
                          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 34, color: 'var(--orange-hot)', lineHeight: 1 }}>{mi + 1}</div>
                        </td>
                      )}
                      <td colSpan={9} style={{ ...td, textAlign: 'left', borderTop: list.length ? td.borderTop : '2px solid var(--orange)' }}>
                        <FoodPicker foods={library} value={adding[m.id] || ''} placeholder="+ Add a food (type to search the library)" ariaLabel={`Add food to ${m.label}`}
                          onFocus={refreshLibrary}
                          onChange={v => setAdding(a => ({ ...a, [m.id]: v }))}
                          onPick={f => addItem(m, f)}
                          onAddUnknown={() => addItem(m)} />
                      </td>
                    </tr>,
                    <tr key={m.id + 'tot'} style={{ background: 'var(--steel)' }}>
                      <td style={{ ...td, textAlign: 'left', borderTop: '1px solid var(--orange)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {field(`ml|${m.id}`, m.label, v => patchMeal(m, 'label', v.trim()), { label: `${m.label} name`, style: { color: 'var(--orange-hot)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', maxWidth: 150 } })}
                          <span style={{ color: 'var(--orange-hot)', fontWeight: 800, fontSize: 12 }}>TOTAL</span>
                        </div>
                      </td>
                      <td style={{ ...td, borderTop: '1px solid var(--orange)', borderRight: '1px solid var(--orange)' }} />
                      <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 900, borderTop: '1px solid var(--orange)' }}>{fmt0(t.kcal)}</td>
                      {[t.p, t.c, t.f, t.fi].map((v, q) => <td key={q} style={{ ...td, fontWeight: 900, borderTop: '1px solid var(--orange)' }}>{fmt1(v)}</td>)}
                      <td style={{ ...td, textAlign: 'left', borderTop: '1px solid var(--orange)' }}>
                        {field(`sw|${m.id}`, m.swap || '', v => patchMeal(m, 'swap', v.trim()), { ph: 'Swap option (e.g. Swap: chicken 180 g + rice 200 g)', label: `${m.label} swap`, style: { fontStyle: 'italic', color: 'var(--muted)', fontSize: 12 } })}
                      </td>
                      <td style={{ ...td, borderTop: '1px solid var(--orange)' }}>
                        <button aria-label={`Delete ${m.label}`} onClick={() => removeMeal(m)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>,
                    <tr key={m.id + 'gap'}><td colSpan={10} style={{ height: 8, padding: 0 }} /></tr>,
                  ]
                })}
                {meals.length > 0 && (
                  <tr style={{ background: 'var(--orange)', color: '#000' }}>
                    <td style={{ ...td, borderTop: 'none' }} />
                    <td style={{ ...td, textAlign: 'left', fontWeight: 900, fontSize: 14, letterSpacing: '.06em', borderTop: 'none' }}>DAILY TOTAL</td>
                    <td style={{ ...td, borderTop: 'none' }} />
                    <td style={{ ...td, fontWeight: 900, fontSize: 15, borderTop: 'none' }}>{fmt0(totals.kcal)}</td>
                    {[totals.p, totals.c, totals.f, totals.fi].map((v, q) => <td key={q} style={{ ...td, fontWeight: 900, fontSize: 15, borderTop: 'none' }}>{fmt0(v)}</td>)}
                    <td colSpan={2} style={{ ...td, borderTop: 'none' }} />
                  </tr>
                )}
              </tbody>
            </table>
            <datalist id="food-lib">{library.map(f => <option key={f.id} value={f.name} />)}</datalist>
          </div>
          {meals.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-ghost" onClick={() => addMeal()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 13 }}><Plus size={14} /> Add meal</button>
              <span className="muted" style={{ fontSize: 12 }}>Pick a food and enter grams; everything else calculates. Need a food that isn't listed? Add it under Library → Foods.</span>
              <Link to="/coach/templates" style={{ fontSize: 12.5, fontWeight: 700, marginLeft: 'auto' }}>Copy to other clients / save as template →</Link>
            </div>
          )}
        </div>
      )}

      {tab === 'shop' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>Builds itself from the meal plan. {client.full_name?.split(' ')[0] || 'The client'} sets the days and ticks items off in their app. You're seeing their list for <strong style={{ color: 'var(--white)' }}>{shop?.days || 7} days</strong>.</p>
          {shopRows.length
            ? <div className="card" style={{ padding: 0 }}><ShoppingTable rows={shopRows} checked={shop?.checked || []} /></div>
            : <div className="card muted">Add foods to the meal plan and the list fills in.</div>}
          {(shop?.extras || []).length > 0 && (
            <div className="card" style={{ fontSize: 13 }}>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>Extras</div>
              {(shop.extras || []).map((e, i) => <div key={i} style={{ padding: '3px 0', color: e.got ? 'var(--muted)' : undefined, textDecoration: e.got ? 'line-through' : 'none' }}>{e.got ? '✓ ' : '• '}{e.name}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
