// Food history (Update 185): re-log what you've eaten before.
//   Recent — foods you log most, one tap to add to the slot you're logging to
//   Past days — step back through any day, copy a whole day, one meal, or one food
//   Saved — your own named meals ("Usual breakfast"), one tap logs every food
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { byMeal, kcalOf } from '../../lib/foodlog'
import { shiftDate, dayLabel, recentFoods, toLogRows, savedItems, macroSum, matchFoods } from '../../lib/foodHistory'

const r0 = n => Math.round(Number(n) || 0)
const macros = l => `P ${r0(l.protein_g ?? l.p)} · C ${r0(l.carbs_g ?? l.c)} · F ${r0(l.fat_g ?? l.f)}`
const tabBtn = on => ({ flex: 1, padding: '7px 0', fontSize: 12.5, fontWeight: 800, borderRadius: 8, cursor: 'pointer', font: 'inherit',
  border: '1px solid ' + (on ? 'var(--orange)' : 'var(--line)'), background: on ? 'rgba(255,85,0,0.14)' : 'transparent', color: on ? 'var(--orange-hot)' : 'inherit' })
const addBtn = { background: 'none', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--orange-hot)', fontWeight: 900,
  fontSize: 16, width: 34, height: 30, cursor: 'pointer', flexShrink: 0 }

export default function FoodHistoryCard({ profile, today, slot, onLogged, refreshKey = 0 }) {
  const [tab, setTab] = useState('recent')
  const [history, setHistory] = useState(null)
  const [q, setQ] = useState('')
  const [day, setDay] = useState(shiftDate(today, -1))
  const [dayLogs, setDayLogs] = useState(null)
  const [saved, setSaved] = useState(null)
  const [savedMissing, setSavedMissing] = useState(false)
  const [flash, setFlash] = useState('')

  async function loadHistory() {
    // Newest 1,000 lines (the per-request row cap) from the last 90 days: plenty to rank habits.
    const { data } = await supabase.from('meal_logs')
      .select('meal_name, meal, protein_g, carbs_g, fat_g, fiber_g, grams, estimated, logged_on, logged_at')
      .eq('client_id', profile.id).gte('logged_on', shiftDate(today, -90))
      .order('logged_on', { ascending: false }).limit(1000)
    setHistory(recentFoods(data || [], { today }))
  }
  async function loadDay(d) {
    setDayLogs(null)
    const { data } = await supabase.from('meal_logs').select('*').eq('client_id', profile.id).eq('logged_on', d).order('logged_at')
    setDayLogs(data || [])
  }
  async function loadSaved() {
    const { data, error } = await supabase.from('saved_meals').select('*').eq('client_id', profile.id).order('created_at', { ascending: false })
    setSavedMissing(!!error); setSaved(data || [])
  }
  useEffect(() => { if (profile?.id) { loadHistory(); loadSaved() } }, [profile?.id, refreshKey])
  useEffect(() => { if (profile?.id && tab === 'days') loadDay(day) }, [profile?.id, tab, day])

  function say(msg) { setFlash(msg); setTimeout(() => setFlash(f => (f === msg ? '' : f)), 2500) }
  async function insert(rows, msg) {
    if (!rows.length) return
    const { error } = await supabase.from('meal_logs').insert(rows)
    if (error) return say('Could not log that — try again.')
    say(msg); onLogged?.()
  }

  const logFood = f => insert(toLogRows([f], { clientId: profile.id, date: today, slot }), `Added to ${slot}`)
  const copyLines = (lines, label) => insert(toLogRows(lines, { clientId: profile.id, date: today }), `${label} copied to today`)
  const logSaved = m => insert(toLogRows(m.items, { clientId: profile.id, date: today, slot }), `${m.name} added to ${slot}`)

  async function saveMeal(lines, suggested) {
    const name = window.prompt('Name this meal', suggested)
    if (!name || !name.trim()) return
    const { error } = await supabase.from('saved_meals').insert({ client_id: profile.id, name: name.trim().slice(0, 80), items: savedItems(lines) })
    if (error) return say('Could not save that meal.')
    say(`Saved "${name.trim()}"`); loadSaved()
  }
  async function deleteSaved(m) {
    if (!window.confirm(`Delete saved meal "${m.name}"?`)) return
    await supabase.from('saved_meals').delete().eq('id', m.id)
    loadSaved()
  }

  const foods = matchFoods(history || [], q)
  const groups = dayLogs ? byMeal(dayLogs.filter(l => l.meal !== 'Daily totals')) : []
  const onlyTotals = dayLogs && dayLogs.length > 0 && groups.length === 0

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="eyebrow">Eat it again</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={tabBtn(tab === 'recent')} onClick={() => setTab('recent')}>Recent</button>
        <button type="button" style={tabBtn(tab === 'days')} onClick={() => setTab('days')}>Past days</button>
        <button type="button" style={tabBtn(tab === 'saved')} onClick={() => setTab('saved')}>Saved meals</button>
      </div>
      {flash && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--green, #3fb950)' }}>✓ {flash}</div>}

      {tab === 'recent' && (
        <>
          <input placeholder="Filter your foods" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter your foods" />
          {history === null ? <p className="muted" style={{ fontSize: 12.5 }}>Loading…</p>
            : !history.length ? <p className="muted" style={{ fontSize: 12.5 }}>Foods you log show up here, most-eaten first, so you can add them again in one tap.</p>
            : !foods.length ? <p className="muted" style={{ fontSize: 12.5 }}>Nothing you've logged matches that.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 340, overflowY: 'auto' }}>
                {foods.map(f => (
                  <div key={`${f.meal_name}|${f.protein_g}|${f.carbs_g}|${f.fat_g}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.meal_name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{r0(kcalOf(f))} kcal · {macros(f)} · {f.count}× · last {dayLabel(f.last, today).toLowerCase()}</div>
                    </div>
                    <button type="button" style={addBtn} aria-label={`Add ${f.meal_name}`} onClick={() => logFood(f)}>+</button>
                  </div>
                ))}
              </div>
            )}
          <p className="muted" style={{ fontSize: 11 }}>+ adds it to {slot}.</p>
        </>
      )}

      {tab === 'days' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btn-ghost" style={{ padding: '6px 12px' }} aria-label="Earlier day" onClick={() => setDay(d => shiftDate(d, -1))}>‹</button>
            <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 14 }}>{dayLabel(day, today)}</div>
            <button type="button" className="btn-ghost" style={{ padding: '6px 12px' }} aria-label="Later day" disabled={day >= shiftDate(today, -1)} onClick={() => setDay(d => shiftDate(d, 1))}>›</button>
          </div>
          {dayLogs === null ? <p className="muted" style={{ fontSize: 12.5 }}>Loading…</p>
            : !dayLogs.length ? <p className="muted" style={{ fontSize: 12.5 }}>Nothing logged that day.</p>
            : onlyTotals ? <p className="muted" style={{ fontSize: 12.5 }}>Only daily totals were logged that day, so there are no foods to copy.</p>
            : (
              <>
                <button type="button" className="btn" style={{ fontSize: 12.5 }} onClick={() => copyLines(groups.flatMap(g => g.items), `${dayLabel(day, today)}'s food`)}>
                  Copy the whole day to today
                </button>
                {groups.map(({ meal, items }) => {
                  const t = macroSum(items)
                  return (
                    <div key={meal || '-'} style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--steel)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: '.06em', color: 'var(--orange-hot)' }}>{(meal || 'Logged').toUpperCase()}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{r0(t.kcal)} kcal · P {r0(t.p)} · C {r0(t.c)} · F {r0(t.f)}</div>
                        </div>
                        <button type="button" className="btn-ghost" style={{ padding: '5px 9px', fontSize: 11.5 }} onClick={() => saveMeal(items, meal || 'My meal')}>Save</button>
                        <button type="button" className="btn-ghost" style={{ padding: '5px 9px', fontSize: 11.5 }} onClick={() => copyLines(items, meal || 'Meal')}>Copy</button>
                      </div>
                      {items.map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderTop: '1px solid var(--line)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{l.meal_name}</div>
                            <div className="muted" style={{ fontSize: 11.5 }}>{r0(kcalOf(l))} kcal · {macros(l)}</div>
                          </div>
                          <button type="button" style={addBtn} aria-label={`Add ${l.meal_name}`} onClick={() => logFood(l)}>+</button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </>
            )}
          <p className="muted" style={{ fontSize: 11 }}>Copy keeps each meal's slot. + adds one food to {slot}. Save keeps a meal for one-tap logging.</p>
        </>
      )}

      {tab === 'saved' && (
        savedMissing ? <p className="muted" style={{ fontSize: 12.5 }}>Saved meals aren't switched on yet.</p>
        : saved === null ? <p className="muted" style={{ fontSize: 12.5 }}>Loading…</p>
        : (
          <>
            {!saved.length && <p className="muted" style={{ fontSize: 12.5 }}>No saved meals yet. Log a meal, then tap <strong>☆ Save</strong> under today's food log, or <strong>Save</strong> on any meal in Past days.</p>}
            {saved.map(m => {
              const t = macroSum(m.items)
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 2px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{m.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{(m.items || []).length} food{(m.items || []).length === 1 ? '' : 's'} · {r0(t.kcal)} kcal · P {r0(t.p)} · C {r0(t.c)} · F {r0(t.f)}</div>
                  </div>
                  <button type="button" className="btn-ghost" style={{ padding: '5px 8px', fontSize: 11.5, color: 'var(--muted)' }} aria-label={`Delete ${m.name}`} onClick={() => deleteSaved(m)}>✕</button>
                  <button type="button" style={addBtn} aria-label={`Log ${m.name}`} onClick={() => logSaved(m)}>+</button>
                </div>
              )
            })}
            <p className="muted" style={{ fontSize: 11 }}>+ logs every food in the meal to {slot}.</p>
          </>
        )
      )}
    </div>
  )
}

// "Save meal" buttons under today's log: one per meal slot logged today.
export function SaveTodayMeals({ profile, meals, onSaved }) {
  const groups = byMeal((meals || []).filter(l => l.meal !== 'Daily totals'))
  if (!groups.length) return null
  async function save(items, meal) {
    const name = window.prompt('Name this meal', meal || 'My meal')
    if (!name || !name.trim()) return
    const { error } = await supabase.from('saved_meals').insert({ client_id: profile.id, name: name.trim().slice(0, 80), items: savedItems(items) })
    if (error) return window.alert('Could not save that meal.')
    onSaved?.()
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {groups.map(({ meal, items }) => (
        <button key={meal || '-'} type="button" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={() => save(items, meal)}>
          ☆ Save {meal || 'meal'} as a meal
        </button>
      ))}
    </div>
  )
}
