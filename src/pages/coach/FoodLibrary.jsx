import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { FOOD_CATEGORIES } from '../../lib/mealplan'

// The sheet's Food Library tab: macros per 100 g, calories work themselves out.
export default function FoodLibrary() {
  const [foods, setFoods] = useState(null)
  const [draft, setDraft] = useState({})
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ name: '', category: 'Protein', protein: '', carbs: '', fat: '', fiber: '' })
  const [error, setError] = useState('')

  async function load() {
    const { data, error: err } = await supabase.from('food_library').select('*').order('category').order('name')
    if (err) setError(/food_library/.test(err.message) ? 'Run the Update 93 SQL in Supabase to turn on the food library.' : err.message)
    setFoods(data || [])
  }
  useEffect(() => { load() }, [])

  async function patch(f, field, raw) {
    const v = ['protein', 'carbs', 'fat', 'fiber'].includes(field) ? (raw === '' ? 0 : Number(raw)) : raw
    if (typeof v === 'number' && Number.isNaN(v)) return
    if (field === 'name' && !String(v).trim()) return
    if (String(f[field]) === String(v)) return
    setFoods(list => list.map(x => (x.id === f.id ? { ...x, [field]: v } : x)))
    const { error: err } = await supabase.from('food_library').update({ [field]: v }).eq('id', f.id)
    if (err) { alert(/duplicate|unique/i.test(err.message) ? 'There is already a food with that name.' : 'Save failed: ' + err.message); load() }
  }
  async function add() {
    setError('')
    if (!form.name.trim()) return
    const row = { name: form.name.trim(), category: form.category }
    for (const k of ['protein', 'carbs', 'fat', 'fiber']) row[k] = Number(form[k]) || 0
    const { error: err } = await supabase.from('food_library').insert(row)
    if (err) { setError(/duplicate|unique/i.test(err.message) ? 'That food is already in the library.' : err.message); return }
    setForm({ name: '', category: form.category, protein: '', carbs: '', fat: '', fiber: '' })
    load()
  }
  async function remove(f) {
    if (!window.confirm(`Delete ${f.name}? Plans that already use it keep their numbers.`)) return
    await supabase.from('food_library').delete().eq('id', f.id)
    load()
  }

  const cell = (f, field, opts = {}) => {
    const key = `${f.id}|${field}`
    return (
      <input value={key in draft ? draft[key] : String(f[field] ?? '')} inputMode={opts.num ? 'decimal' : undefined} aria-label={`${f.name} ${field}`}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        onBlur={() => { if (key in draft) { patch(f, field, String(draft[key]).trim()); setDraft(d => { const n = { ...d }; delete n[key]; return n }) } }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ padding: '6px 6px', fontSize: 13, textAlign: opts.num ? 'center' : 'left', fontWeight: opts.bold ? 700 : 500 }} />
    )
  }
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '3px 5px', borderTop: '1px solid var(--line)', verticalAlign: 'middle' }
  const shown = (foods || []).filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()) || f.category.toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="muted" style={{ fontSize: 13 }}>Macros per 100 g. These are the foods you can pick in a client's meal plan. Check labels for branded foods.</p>
      {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr repeat(4, 1fr) auto', gap: 6, alignItems: 'end' }}>
        <div><label className="muted" style={{ fontSize: 11 }}>Food</label><input value={form.name} placeholder="e.g. Jasmine Rice (cooked)" onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="muted" style={{ fontSize: 11 }}>Category</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{FOOD_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
        {['protein', 'carbs', 'fat', 'fiber'].map(k => (
          <div key={k}><label className="muted" style={{ fontSize: 11, textTransform: 'capitalize' }}>{k} / 100 g</label><input inputMode="decimal" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} /></div>
        ))}
        <button className="btn" onClick={add} style={{ padding: '10px 14px', fontSize: 13 }}>+ Add food</button>
      </div>
      <input placeholder="Search foods…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280 }} />
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left', paddingLeft: 12 }}>Food</th><th style={th}>Category</th><th style={th}>Protein</th><th style={th}>Carbs</th><th style={th}>Fat</th><th style={th}>Fiber</th><th style={th}>Kcal (auto)</th><th style={th} />
          </tr></thead>
          <tbody>
            {foods && shown.length === 0 && <tr><td colSpan={8} className="muted" style={{ ...td, padding: 14 }}>No foods match.</td></tr>}
            {shown.map((f, i) => (
              <tr key={f.id} style={{ background: i % 2 ? 'var(--steel)' : 'transparent' }}>
                <td style={{ ...td, paddingLeft: 10, minWidth: 230 }}>{cell(f, 'name', { bold: true })}</td>
                <td style={{ ...td, width: 120 }}>
                  <select value={f.category} aria-label={`${f.name} category`} onChange={e => patch(f, 'category', e.target.value)} style={{ padding: '6px 6px', fontSize: 13 }}>
                    {FOOD_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                {['protein', 'carbs', 'fat', 'fiber'].map(k => <td key={k} style={{ ...td, width: 80 }}>{cell(f, k, { num: true })}</td>)}
                <td style={{ ...td, textAlign: 'center', color: 'var(--orange-hot)', fontWeight: 800, width: 90 }}>{Math.round(f.protein * 4 + f.carbs * 4 + f.fat * 9)}</td>
                <td style={{ ...td, width: 34 }}><button aria-label={`Delete ${f.name}`} onClick={() => remove(f)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
