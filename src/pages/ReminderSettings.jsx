// Notifications page, shared by clients (/app/reminders) and the coach
// (/coach/notifications). Turn this device on, choose what to get, send a test.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Share, PlusSquare, Smartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { pushStatus, isSubscribed, enablePush, disablePush, callApi } from '../lib/push'
import { DEFAULT_PREFS } from '../lib/reminders'
import { CALL_LEAD_OPTIONS, DEFAULT_CALL_LEAD } from '../lib/agenda'

const CLIENT_ITEMS = [
  ['workout', 'Training days', 'Morning heads-up when a session is on, and an evening nudge if it isn’t logged.'],
  ['food', 'Food log', 'Evening reminder if nothing’s logged for today.'],
  ['habits', 'Habits', 'Evening reminder of habits not ticked yet.'],
  ['checkin', 'Check-in', 'The evening before, the morning it’s due, and for up to 3 days if it’s late.'],
  ['messages', 'Messages from your coach', 'As soon as your coach messages you.'],
  ['calls', 'Calls with your coach', 'Before a booked call starts, with the link to join.'],
]
const COACH_ITEMS = [
  ['messages', 'Client messages', 'As soon as a client messages you.'],
  ['checkin', 'New check-ins', 'When a client submits a check-in, plus the count waiting each evening.'],
  ['slipping', 'Clients going quiet', 'Evening “Client radar”: anyone who hasn’t opened the app in 3+ days.'],
  ['calls', 'Calls & timed tasks', 'Before each booked call (tap to join) and timed task, plus a “Today” rundown at 7am.'],
]

export default function ReminderSettings() {
  const { profile } = useAuth()
  const coach = profile?.role === 'coach'
  const [st, setSt] = useState(() => pushStatus())
  const [on, setOn] = useState(null)
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, call_lead_minutes: DEFAULT_CALL_LEAD })
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null)   // { ok, text }

  useEffect(() => {
    isSubscribed().then(setOn)
    if (!profile) return
    supabase.from('reminder_prefs').select('*').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => data && setPrefs({ ...DEFAULT_PREFS, call_lead_minutes: DEFAULT_CALL_LEAD, ...data }))
  }, [profile?.id])

  async function turnOn() {
    setBusy('on'); setNote(null)
    try { await enablePush(profile.id); setOn(true)
      if (profile.role === 'client') supabase.from('client_setup').upsert({ client_id: profile.id, push_on_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'client_id' }).then(() => {}); setNote({ ok: true, text: 'Notifications are on for this device. Send yourself a test below.' }) }
    catch (e) { setNote({ ok: false, text: e.message }) }
    setSt(pushStatus()); setBusy('')
  }
  async function turnOff() {
    setBusy('off'); setNote(null)
    try { await disablePush(); setOn(false); setNote({ ok: true, text: 'Notifications are off for this device.' }) }
    catch (e) { setNote({ ok: false, text: e.message }) }
    setBusy('')
  }
  async function test() {
    setBusy('test'); setNote(null)
    try { await callApi('/api/push-test'); setNote({ ok: true, text: 'Sent. It should pop up in a few seconds.' }) }
    catch (e) { setNote({ ok: false, text: e.message }) }
    setBusy('')
  }
  async function savePrefs(next) {
    setPrefs(next)
    const row = { user_id: profile.id, updated_at: new Date().toISOString() }
    Object.keys(DEFAULT_PREFS).forEach(k => { row[k] = next[k] !== false })
    row.call_lead_minutes = Number(next.call_lead_minutes ?? DEFAULT_CALL_LEAD)
    const { error } = await supabase.from('reminder_prefs').upsert(row, { onConflict: 'user_id' })
    if (error) { setPrefs(prefs); setNote({ ok: false, text: 'Could not save: ' + error.message }) }
  }
  const toggle = key => savePrefs({ ...prefs, [key]: !prefs[key] })

  const items = coach ? COACH_ITEMS : CLIENT_ITEMS
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <header>
        <div className="eyebrow">{coach ? 'Settings' : 'Stay on track'}</div>
        <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>{coach ? 'Notifications' : 'Reminders'}</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          {coach ? 'Get pinged when clients message or check in, and a nightly list of anyone going quiet.'
            : 'Get a nudge on your phone so nothing slips: training days, food, habits and check-ins. One message in the morning, one in the evening, at most, plus a heads-up before any call with your coach.'}
        </p>
      </header>

      <section className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {on ? <Bell size={22} color="var(--orange)" /> : <BellOff size={22} color="var(--muted)" />}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 18, textTransform: 'uppercase', letterSpacing: '.03em' }}>
              {on === null ? 'Checking…' : on ? 'On for this device' : 'Off on this device'}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Turn it on for each phone or computer you use.</div>
          </div>
        </div>

        {st.needsHomeScreen ? (
          <div style={{ background: 'var(--coal-2, rgba(255,255,255,.04))', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Smartphone size={16} /> On iPhone, add the app to your Home Screen first</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
              <li>Open this page in <b>Safari</b>.</li>
              <li>Tap the <b>Share</b> button <Share size={14} style={{ verticalAlign: '-2px' }} /> at the bottom.</li>
              <li>Tap <b>Add to Home Screen</b> <PlusSquare size={14} style={{ verticalAlign: '-2px' }} />, then <b>Add</b>.</li>
              <li>Open Workhorse Strong from the new icon, come back here and tap <b>Turn on</b>.</li>
            </ol>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Needs iOS 16.4 or newer. Apple only allows notifications for apps on the Home Screen.</div>
          </div>
        ) : !st.supported ? (
          <p className="muted" style={{ fontSize: 14 }}>This browser can’t show notifications. Try Chrome, Edge or Safari, or the app on your phone.</p>
        ) : st.permission === 'denied' ? (
          <p style={{ fontSize: 14, color: 'var(--red)' }}>Notifications are blocked for this app. Allow them in your {st.ios ? 'iPhone Settings → Notifications → Workhorse Strong' : 'browser’s site settings'}, then reload this page.</p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!on && <button className="btn" onClick={turnOn} disabled={!!busy}>{busy === 'on' ? 'Turning on…' : 'Turn on notifications'}</button>}
            {on && <button className="btn" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Sending…' : 'Send me a test'}</button>}
            {on && <button className="btn-ghost" onClick={turnOff} disabled={!!busy}>Turn off on this device</button>}
          </div>
        )}
        {note && <p style={{ fontSize: 13, marginTop: 10, color: note.ok ? 'var(--green)' : 'var(--red)' }}>{note.text}</p>}
        <Link to="/guide/notifications" style={{ display: 'inline-block', marginTop: 12, fontSize: 13.5, color: 'var(--orange)', fontWeight: 700 }}>📖 Step-by-step guide with pictures (iPhone &amp; Android) →</Link>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>What to send me</div>
        {items.map(([k, label, desc]) => (
          <label key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs[k] !== false} onChange={() => toggle(k)} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: 'var(--orange)' }} />
            <span><b style={{ fontSize: 14 }}>{label}</b><br /><span className="muted" style={{ fontSize: 13 }}>{desc}</span></span>
          </label>
        ))}
        {prefs.calls !== false && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0 0 30px', fontSize: 14 }}>
            Call reminder
            <select value={prefs.call_lead_minutes ?? DEFAULT_CALL_LEAD} onChange={e => savePrefs({ ...prefs, call_lead_minutes: Number(e.target.value) })} style={{ width: 'auto' }}>
              {CALL_LEAD_OPTIONS.map(m => <option key={m} value={m}>{m === 0 ? 'When it starts' : `${m} min before`}</option>)}
            </select>
          </label>
        )}
        {!coach && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Morning reminders go out around 8am and evening ones around 7pm (Eastern).</p>}
      </section>
      {!coach && <Link to="/app" className="muted" style={{ fontSize: 13 }}>← Back to Home</Link>}
    </div>
  )
}

// Small card for the client Home page until notifications are on.
export function RemindersPrompt() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let hidden = false
    try { hidden = localStorage.getItem('ws-reminders-dismissed') === '1' } catch { /* ignore */ }
    if (hidden) return
    const st = pushStatus()
    if (!st.supported && !st.needsHomeScreen) return
    isSubscribed().then(s => setShow(!s))
  }, [])
  if (!show) return null
  const dismiss = () => { try { localStorage.setItem('ws-reminders-dismissed', '1') } catch { /* ignore */ } setShow(false) }
  return (
    <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', borderColor: 'var(--orange)' }}>
      <Bell size={22} color="var(--orange)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 14 }}><b>Turn on reminders</b><br /><span className="muted" style={{ fontSize: 13 }}>Get a nudge for training days, food, habits and check-ins.</span></div>
      <Link to="/app/reminders" className="btn" style={{ whiteSpace: 'nowrap' }}>Set up</Link>
      <button className="btn-ghost" onClick={dismiss} aria-label="Dismiss" style={{ padding: '4px 8px' }}>✕</button>
    </div>
  )
}
