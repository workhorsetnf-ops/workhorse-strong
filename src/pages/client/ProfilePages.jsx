// Profile sub-pages, CoachRx-style (Update 192): Equipment, Goals and
// Training schedule. Each is reached from a row on the Profile tab.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { EQUIPMENT, toggleEquipment, cleanTrainTimes, TIME_LABEL } from '../../lib/clientRx'
import { WEEKDAY_SHORT } from '../../lib/weeks'
import TrainingDays from '../../components/TrainingDays'

export function SubHeader({ title }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      <Link to="/app/profile" aria-label="Back to profile" style={{ color: 'inherit', display: 'flex' }}><ChevronLeft size={28} /></Link>
      <h1 style={{ fontSize: 28 }}>{title}</h1>
    </header>
  )
}

export function ClientEquipment() {
  const { profile, refreshProfile } = useAuth()
  const [list, setList] = useState(profile?.equipment || [])
  const [state, setState] = useState('')
  useEffect(() => { setList(profile?.equipment || []) }, [profile?.id])
  async function flip(item) {
    const next = toggleEquipment(list, item)
    setList(next); setState('saving')
    const { error } = await supabase.from('profiles').update({ equipment: next }).eq('id', profile.id)
    if (error) { setList(list); return setState(/equipment/.test(error.message) ? 'Equipment isn’t switched on yet. Ask your coach.' : 'Couldn’t save: ' + error.message) }
    setState('Saved'); refreshProfile?.()
  }
  return (
    <div>
      <SubHeader title="Equipment" />
      <p className="muted" style={{ fontSize: 14.5, marginBottom: 16 }}>Tick everything you can train with. Your coach uses this to pick exercises and swaps that work for you.</p>
      {EQUIPMENT.map(([group, items]) => (
        <section key={group} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>{group}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => {
              const on = list.includes(item)
              return (
                <button key={item} type="button" role="checkbox" aria-checked={on} onClick={() => flip(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontSize: 16, color: 'inherit',
                    background: 'var(--coal)', border: '1px solid ' + (on ? 'var(--orange)' : 'var(--line)') }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center', border: '2px solid ' + (on ? 'var(--orange)' : 'var(--muted)'), background: on ? 'var(--orange)' : 'transparent' }}>
                    {on && <Check size={16} color="#140A02" strokeWidth={3} />}
                  </span>
                  {item}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {state && state !== 'saving' && <p role="status" style={{ fontSize: 13, color: state === 'Saved' ? 'var(--green)' : 'var(--red)' }}>{state}</p>}
    </div>
  )
}

const PHASE = { cut: 'Cut: losing fat', build: 'Build: adding muscle', recomp: 'Recomp', maintain: 'Maintain' }

export function ClientGoals() {
  const { profile, refreshProfile } = useAuth()
  const [goal, setGoal] = useState(profile?.goal || '')
  const [state, setState] = useState('')
  useEffect(() => { setGoal(profile?.goal || '') }, [profile?.id])
  async function save() {
    setState('saving')
    const { error } = await supabase.from('profiles').update({ goal: goal.trim() }).eq('id', profile.id)
    if (error) return setState('Couldn’t save: ' + error.message)
    setState('Saved'); refreshProfile?.()
  }
  const p = profile || {}
  const kcal = (p.protein_g || 0) * 4 + (p.carbs_g || 0) * 4 + (p.fat_g || 0) * 9
  return (
    <div>
      <SubHeader title="Goals" />
      <label style={{ display: 'block', fontSize: 15, fontWeight: 700, marginBottom: 6 }} htmlFor="goal">Your goal</label>
      <textarea id="goal" rows={3} placeholder="e.g. Drop to 205 for TV in March" value={goal} onChange={e => { setGoal(e.target.value); setState('') }} />
      <button className="btn" onClick={save} disabled={state === 'saving' || goal.trim() === (p.goal || '')} style={{ marginTop: 10 }}>{state === 'saving' ? 'Saving…' : 'Save goal'}</button>
      {state && state !== 'saving' && <span style={{ marginLeft: 10, fontSize: 13, color: state === 'Saved' ? 'var(--green)' : 'var(--red)' }}>{state}</span>}

      <h2 style={{ fontSize: 15, letterSpacing: '.06em', textTransform: 'uppercase', margin: '26px 0 10px' }}>Set by your coach</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Fact label="Phase" value={PHASE[p.phase] || '—'} />
        <Fact label="Daily calories" value={kcal ? kcal.toLocaleString() : '—'} />
        <Fact label="Protein · Carbs · Fat" value={p.protein_g ? `${p.protein_g}g · ${p.carbs_g}g · ${p.fat_g}g` : '—'} />
        <Fact label="Daily steps" value={p.steps_target ? Number(p.steps_target).toLocaleString() : '—'} />
      </div>
    </div>
  )
}
const Fact = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 16 }}>
    <span className="muted">{label}</span><strong>{value}</strong>
  </div>
)

export function ClientSchedule() {
  const { profile } = useAuth()
  const [a, setA] = useState(undefined)
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('program_assignments').select('*').eq('client_id', profile.id).maybeSingle().then(({ data }) => setA(data || null))
  }, [profile?.id])
  const times = cleanTrainTimes(a?.train_times)
  return (
    <div>
      <SubHeader title="Training schedule" />
      {a === undefined ? <p className="muted">Loading…</p> : !a ? <p className="muted">Your coach hasn’t assigned a program yet.</p> : (
        <>
          <TrainingDays programId={a.program_id} initialMap={a.day_map} />
          {Object.keys(times).length > 0 && (
            <section style={{ marginTop: 22 }}>
              <h2 style={{ fontSize: 15, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>Time of day</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {WEEKDAY_SHORT.map((w, i) => times[String(i + 1)] && (
                  <div key={w} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 16 }}>
                    <span>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}</span>
                    <strong style={{ color: 'var(--orange-hot)' }}>{TIME_LABEL[times[String(i + 1)]]}</strong>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Set by your coach.</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
