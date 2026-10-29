// Client Home: first-week "Get set up" checklist. Ticks itself off from real
// data, links each step to the right page or picture guide, and hides once
// everything's done (or the client hides it).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { isSubscribed } from '../../lib/push'
import { platformOf, setupItems } from '../../lib/setup'

export default function SetupChecklist({ profile, onVisible }) {
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    let alive = true
    ;(async () => {
      const id = profile.id
      const platform = platformOf()
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
      const pushNow = await isSubscribed().catch(() => false)
      const head = { count: 'exact', head: true }
      const [setup, synced, steps, wl, ml, ck] = await Promise.all([
        supabase.from('client_setup').select('*').eq('client_id', id).maybeSingle(),
        supabase.from('daily_logs').select('id', head).eq('client_id', id).eq('steps_source', 'shortcut'),
        supabase.from('daily_logs').select('id', head).eq('client_id', id).not('steps', 'is', null),
        supabase.from('workout_logs').select('id', head).eq('client_id', id),
        supabase.from('meal_logs').select('id', head).eq('client_id', id),
        supabase.from('checkins').select('id', head).eq('client_id', id),
      ])
      const row = setup.data || {}
      // remember what only this phone can tell us, so the coach can see it
      const patch = {}
      if (standalone && !row.installed_at) patch.installed_at = new Date().toISOString()
      if (pushNow && !row.push_on_at) patch.push_on_at = new Date().toISOString()
      if (platform !== 'other' && row.platform !== platform) patch.platform = platform
      if (!setup.error && Object.keys(patch).length) {
        await supabase.from('client_setup').upsert({ client_id: id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
      }
      const f = {
        platform: platform === 'other' ? (row.platform || 'other') : platform,
        installed: standalone || !!row.installed_at, pushOn: pushNow || !!row.push_on_at,
        stepsSynced: (synced.count || 0) > 0, anySteps: (steps.count || 0) > 0,
        workout: (wl.count || 0) > 0, food: (ml.count || 0) > 0, checkin: (ck.count || 0) > 0,
      }
      if (alive) setState({ ...setupItems(f), dismissed: !!row.dismissed_at, tableMissing: !!setup.error })
    })()
    return () => { alive = false }
  }, [profile?.id])

  const show = !!state && !state.dismissed && state.done < state.total
  useEffect(() => { onVisible?.(show) }, [show])
  if (!show) return null

  async function hide() {
    setState(s => ({ ...s, dismissed: true }))
    await supabase.from('client_setup').upsert({ client_id: profile.id, dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
  }

  const pct = Math.round((state.done / state.total) * 100)
  return (
    <div className="card" style={{ borderColor: 'var(--orange)', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 16 }}>Get set up</strong>
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>{state.done} of {state.total} done</span>
      </div>
      <div style={{ height: 6, background: 'var(--steel)', borderRadius: 3, margin: '8px 0 10px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--orange)', borderRadius: 3, transition: 'width .3s' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {state.items.map(i => (
          <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: i.done ? 0.55 : 1 }}>
            {i.done ? <CheckCircle2 size={20} color="var(--green)" style={{ flexShrink: 0 }} /> : <Circle size={20} color="var(--muted)" style={{ flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 14, fontWeight: i.done ? 400 : 700, textDecoration: i.done ? 'line-through' : 'none' }}>{i.label}</span>
            {!i.done && <Link to={i.to} className="btn" style={{ padding: '6px 12px', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>{i.cta}</Link>}
          </div>
        ))}
      </div>
      <button className="btn-ghost" onClick={hide} style={{ marginTop: 8, padding: '4px 10px', fontSize: 12 }}>Hide this</button>
    </div>
  )
}
