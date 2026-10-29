// Client setup page: send Apple Health steps to the app every night with an
// iPhone Shortcut. Each client has a private link; the Shortcut posts today's
// step count to it (see /api/steps).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Footprints, Copy, Check, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function StepsSync() {
  const { profile } = useAuth()
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [shortcutUrl, setShortcutUrl] = useState('')
  const [last, setLast] = useState(null)

  async function loadToken(rotate = false) {
    setErr('')
    const { data, error } = await supabase.rpc('my_steps_token', { rotate })
    if (error) setErr('Could not load your link. Ask your coach to run Update 143 in Supabase.')
    else setToken(data)
  }
  useEffect(() => {
    if (!profile?.id) return
    loadToken()
    supabase.from('client_hub').select('steps_shortcut_url').eq('id', 1).maybeSingle()
      .then(({ data }) => setShortcutUrl(data?.steps_shortcut_url || ''))
    supabase.from('daily_logs').select('log_date, steps, steps_synced_at').eq('client_id', profile.id).eq('steps_source', 'shortcut')
      .order('steps_synced_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLast(data || null))
  }, [profile?.id])

  const link = token ? `${window.location.origin}/api/steps?t=${token}` : ''
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { window.prompt('Copy your link:', link) }
  }
  async function rotate() {
    if (!confirm('Make a new link? The old one stops working, so you’ll need to paste the new one into your Shortcut.')) return
    await loadToken(true)
  }

  const step = (n, title, body) => (
    <li style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--orange)', color: '#000', fontWeight: 900, fontSize: 13, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 14, lineHeight: 1.5 }}><b>{title}</b>{body && <><br /><span className="muted">{body}</span></>}</span>
    </li>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <header>
        <div className="eyebrow">Progress</div>
        <h1 style={{ fontSize: 28, margin: '6px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}><Footprints size={26} color="var(--orange)" /> Sync steps from iPhone</h1>
        <p className="muted" style={{ fontSize: 14 }}>Set this up once and your steps from Apple Health (iPhone or Apple Watch) land in the app every night. No more typing them in.</p>
      </header>

      <section className="card" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Your private link</div>
        {err ? <p style={{ color: 'var(--red)', fontSize: 14 }}>{err}</p> : (
          <>
            <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', background: 'var(--steel)', padding: 10, borderRadius: 8 }}>{link || 'Loading…'}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={copy} disabled={!link} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy link'}</button>
              <button className="btn-ghost" onClick={rotate} disabled={!link} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> New link</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Keep this to yourself. Anyone with it can update your step count.</p>
          </>
        )}
        <p style={{ fontSize: 13, marginTop: 10, color: last ? 'var(--green)' : 'var(--muted)' }}>
          {last ? `Last synced: ${Number(last.steps).toLocaleString()} steps for ${last.log_date}, ${new Date(last.steps_synced_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet. Run the Shortcut once after setting it up and it shows here.'}
        </p>
      </section>

      {shortcutUrl ? (
        <section className="card" style={{ padding: 16 }}>
          <div className="eyebrow">Set up (2 minutes)</div>
          <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {step(1, 'Copy your link above.')}
            {step(2, <>Open the <a href={shortcutUrl} target="_blank" rel="noreferrer">Workhorse Steps Shortcut</a> on your iPhone and tap Add Shortcut.</>, 'When it asks for your link, paste it.')}
            {step(3, 'Run it once.', 'Open Shortcuts, tap the new shortcut, and tap Allow when it asks for Health access.')}
            {step(4, 'Make it automatic.', 'Shortcuts → Automation → + → Time of Day → 11:30 PM, Daily → Run Immediately → Next → pick the shortcut → Done.')}
          </ol>
        </section>
      ) : (
        <section className="card" style={{ padding: 16 }}>
          <div className="eyebrow">Set up (5 minutes, on your iPhone)</div>
          <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {step(1, 'Copy your link above.')}
            {step(2, 'Open the Shortcuts app and tap + to make a new shortcut.')}
            {step(3, 'Add “Find Health Samples”.', 'Set it to: Type is Steps, Start Date is Today. Turn on Group By: Day.')}
            {step(4, 'Add “Calculate Statistics”.', 'Set it to Sum of the Health Samples.')}
            {step(5, 'Add “Get Contents of URL”.', 'Paste your link as the URL. Tap the arrow: Method POST, Request Body JSON, add a Number field named steps and set it to the Statistics result.')}
            {step(6, 'Name it “Sync Steps” and run it once.', 'Tap Allow when it asks for Health access. Your steps should appear above.')}
            {step(7, 'Make it automatic.', 'Automation tab → + → Time of Day → 11:30 PM, Daily → Run Immediately → Next → pick Sync Steps → Done.')}
          </ol>
        </section>
      )}

      <p className="muted" style={{ fontSize: 12 }}>Android or no iPhone? Keep entering steps on the Progress page. If you type steps for a day, the next sync for that day replaces them with your Health number.</p>
      <Link to="/app/progress" className="muted" style={{ fontSize: 13 }}>← Back to Progress</Link>
    </div>
  )
}
