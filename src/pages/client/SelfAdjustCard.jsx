// Group members (Update 182): the macro check from the nutrition guide, on the
// Eat tab. The database works out whether a change is due from the member's own
// logs and weigh-ins; the member taps once to apply it.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr } from '../../lib/weeks'
import { selfAdjustCopy, macroLine } from '../../lib/selfAdjust'

const TONE = { muted: 'var(--muted)', warn: 'var(--orange)', good: 'var(--green, #3fb950)', action: 'var(--orange-hot)' }

export default function SelfAdjustCard({ onApplied }) {
  const { profile, refreshProfile } = useAuth()
  const [r, setR] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  async function check() {
    const { data, error } = await supabase.rpc('self_adjust_check', { p_today: localDateStr(new Date()) })
    setR(error ? null : data)
  }
  useEffect(() => { check() }, [profile?.id])

  async function apply() {
    const msg = `Change your daily targets to ${macroLine(r.to)}?` + '\n\nYour meal plan portions for rice, oats, potatoes and other carb foods will be resized to match.'
    if (!window.confirm(msg)) return
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('apply_self_adjustment', { p_today: localDateStr(new Date()) })
    setBusy(false)
    if (error) { setErr(error.message); check(); return }
    setDone(data)
    await refreshProfile?.()
    onApplied?.()
  }

  if (done) {
    return (
      <div className="card" style={{ padding: 14, fontSize: 14, borderLeft: '3px solid var(--orange)' }}>
        <b>New targets set: {macroLine(done.to)}</b>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {done.plan_items_resized > 0 ? 'Your meal plan has been resized to match. ' : ''}
          Give it two full weeks. Coach can see the change in your history.
        </div>
      </div>
    )
  }

  const c = selfAdjustCopy(r, { tier: profile?.group_tier })
  if (!c) return null
  return (
    <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `3px solid ${TONE[c.tone]}` }}>
      <Scale size={20} color={TONE[c.tone]} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, fontSize: 14 }}>
        <b>{c.title}</b>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{c.body}</div>
        {c.cta === 'apply' && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13 }}>
              <span className="muted">Now:</span> {macroLine(r.from)}<br />
              <span className="muted">New:</span> <b>{macroLine(r.to)}</b>
            </div>
            <button className="btn" disabled={busy} onClick={apply} style={{ alignSelf: 'flex-start' }}>
              {busy ? 'Updating…' : `Apply: ${r.kind === 'down' ? '−' : '+'}${r.step || 30} g carbs`}
            </button>
          </div>
        )}
        {c.cta === 'message' && (
          <Link to="/app/messages" style={{ display: 'inline-block', marginTop: 8, color: 'var(--orange)', fontSize: 13, fontWeight: 700 }}>Message Coach ›</Link>
        )}
        {err && <div style={{ color: 'var(--red, #f85149)', fontSize: 13, marginTop: 6 }}>{err}</div>}
      </div>
    </div>
  )
}
