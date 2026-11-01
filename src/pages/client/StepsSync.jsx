// Client setup page: send Apple Health steps (and, optionally, the day's food
// totals from MyFitnessPal or any app that writes to Health) to the app every
// night with an iPhone Shortcut. Each client has a private link; the Shortcut
// posts today's numbers to it (see /api/steps).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Footprints, Copy, Check, RefreshCw, Utensils } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { HEALTH_NAME } from '../../lib/foodlog'

export default function StepsSync() {
  const { profile } = useAuth()
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [shortcutUrl, setShortcutUrl] = useState('')
  const [last, setLast] = useState(null)
  const [lastFood, setLastFood] = useState(null)

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
    supabase.from('meal_logs').select('logged_on, protein_g, carbs_g, fat_g, logged_at').eq('client_id', profile.id).eq('meal_name', HEALTH_NAME)
      .order('logged_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLastFood(data || null))
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
        <h1 style={{ fontSize: 28, margin: '6px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}><Footprints size={26} color="var(--orange)" /> Sync from Apple Health</h1>
        <p className="muted" style={{ fontSize: 14 }}>Set this up once and your steps from Apple Health (iPhone or Apple Watch) land in the app every night. Track food in MyFitnessPal? Your daily totals can come over too.</p>
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
        {lastFood && (
          <p style={{ fontSize: 13, marginTop: 4, color: 'var(--green)' }}>
            Food last synced: {lastFood.protein_g}P / {lastFood.carbs_g}C / {lastFood.fat_g}F for {lastFood.logged_on}, {new Date(lastFood.logged_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
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
          <Link to="/guide/steps" style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 700 }}>📖 Full picture guide →</Link>
        </section>
      ) : (
        <section className="card" style={{ padding: 16, borderColor: 'var(--orange)' }}>
          <div className="eyebrow">Set up (5 minutes, on your iPhone)</div>
          <p style={{ fontSize: 14, margin: '8px 0 12px', lineHeight: 1.5 }}>Copy your link above, then follow the step-by-step guide. Every step has a picture of exactly what to tap.</p>
          <Link to="/guide/steps" className="btn" style={{ display: 'inline-block', textDecoration: 'none' }}>📖 Open the picture guide →</Link>
        </section>
      )}

      <section className="card" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Utensils size={14} /> Track food in MyFitnessPal? (optional)</div>
        <p style={{ fontSize: 14, margin: '8px 0 0', lineHeight: 1.5 }}>Keep logging in MyFitnessPal and your protein, carbs and fat show up here every night. Works with any app that saves food to Apple Health (Cronometer, MacroFactor and others too).</p>
        <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {step(1, 'Let MyFitnessPal write to Apple Health.', 'In MyFitnessPal, find Apple Health under Apps & Devices (or Sharing & Privacy) and turn on Nutrition. Or: Health app → your picture → Apps → MyFitnessPal → turn on Protein, Carbohydrates, Total Fat and Fiber.')}
          {step(2, 'Add the food fields to your Shortcut.', 'The picture guide shows exactly where (about 3 minutes).')}
          {step(3, 'Run it once.', 'Tap Allow when it asks to read your nutrition from Health.')}
        </ol>
        <Link to="/guide/steps#food" style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 700 }}>📖 Add food to my Shortcut →</Link>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Synced food counts as your whole day, like typing in daily totals, so don’t also log the same meals in this app. On a day with no food in Health, nothing is changed.</p>
      </section>

      <p className="muted" style={{ fontSize: 12 }}>Android or no iPhone? Keep entering steps on the Progress page and food on the Eat page. If you type steps or daily totals for a day, the next sync for that day replaces them with your Health numbers.</p>
      <Link to="/app/progress" className="muted" style={{ fontSize: 13 }}>← Back to Progress</Link>
    </div>
  )
}
