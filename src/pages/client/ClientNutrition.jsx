import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientNutrition() {
  const { profile } = useAuth()
  const [meals, setMeals] = useState([])
  const [form, setForm] = useState({ meal_name: '', protein_g: '', carbs_g: '', fat_g: '' })
  const today = new Date().toISOString().slice(0, 10)

  async function load() {
    const { data } = await supabase.from('meal_logs').select('*')
      .eq('client_id', profile.id).eq('logged_on', today).order('logged_at')
    setMeals(data || [])
  }
  useEffect(() => { if (profile) load() }, [profile])

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
        <div className="eyebrow">Log a meal</div>
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
