import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Video, Plus, Trash2, Calendar, Clock, Plane, Settings, X, ExternalLink, Copy,
} from 'lucide-react'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Dublin', 'Europe/Madrid', 'Europe/Berlin',
  'Asia/Tokyo', 'Australia/Sydney', 'UTC',
]

// minutes-from-midnight <-> the value an <input type="time"> wants
function minToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function timeToMin(t) {
  const [h, m] = (t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
function minLabel(m) {
  const h = Math.floor(m / 60), mm = m % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

// Everything is rendered in the coach's configured business timezone, not the
// browser's — so the schedule reads the same whether he's home or on the road.
function fmt(iso, tz, opts) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso))
  }
}
function fmtDateTime(iso, tz) {
  return fmt(iso, tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtDate(iso, tz) {
  return fmt(iso, tz, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CoachCalls() {
  const [settings, setSettings] = useState(null)
  const [avail, setAvail] = useState([])
  const [blackouts, setBlackouts] = useState([])
  const [bookings, setBookings] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [savedMsg, setSavedMsg] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [newSlot, setNewSlot] = useState({ weekday: 0, start: '09:00', end: '12:00' })
  const [newBlackout, setNewBlackout] = useState({ start: '', end: '', reason: '' })
  const [bookFor, setBookFor] = useState(null)
  const [tab, setTab] = useState('upcoming')

  async function load() {
    const [{ data: s }, { data: a }, { data: b }, { data: bk }, { data: cl }] = await Promise.all([
      supabase.from('coach_call_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('coach_availability').select('*').order('weekday').order('start_minute'),
      supabase.from('coach_blackouts').select('*').order('starts_at'),
      supabase.from('bookings').select('*').order('starts_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, status').eq('role', 'client').order('full_name'),
    ])
    setSettings(s || null)
    setAvail(a || [])
    setBlackouts(b || [])
    setBookings(bk || [])
    setClients(cl || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function flash(msg) { setSavedMsg(msg); setTimeout(() => setSavedMsg(''), 2200) }

  async function saveSettings(patch) {
    const next = { ...settings, ...patch }
    setSettings(next)
    const { error } = await supabase.from('coach_call_settings').update(patch).eq('id', 1)
    if (error) { alert('Could not save: ' + error.message); load(); return }
    flash('Saved')
  }

  async function addSlot() {
    const start = timeToMin(newSlot.start)
    const end = timeToMin(newSlot.end)
    if (end <= start) { alert('The end time needs to be after the start time.'); return }
    const { error } = await supabase.from('coach_availability').insert({
      weekday: Number(newSlot.weekday), start_minute: start, end_minute: end,
    })
    if (error) { alert('Could not add that window: ' + error.message); return }
    load()
  }

  async function removeSlot(id) {
    await supabase.from('coach_availability').delete().eq('id', id)
    load()
  }

  async function toggleSlot(slot) {
    await supabase.from('coach_availability').update({ active: !slot.active }).eq('id', slot.id)
    load()
  }

  async function addBlackout() {
    if (!newBlackout.start || !newBlackout.end) { alert('Pick both dates.'); return }
    // Dates go to the DB as plain dates — Postgres resolves them against the
    // business timezone, so this is right even when booked from another zone.
    const { error } = await supabase.rpc('add_blackout', {
      start_date: newBlackout.start, end_date: newBlackout.end, reason: newBlackout.reason || '',
    })
    if (error) { alert('Could not add that: ' + error.message); return }
    setNewBlackout({ start: '', end: '', reason: '' })
    load()
  }

  async function removeBlackout(id) {
    await supabase.from('coach_blackouts').delete().eq('id', id)
    load()
  }

  async function cancel(b) {
    const who = clients.find(c => c.id === b.client_id)?.full_name || 'this client'
    if (!confirm(`Cancel the call with ${who} on ${fmtDateTime(b.starts_at, tz)}?`)) return
    const { error } = await supabase.rpc('cancel_booking', { booking_id: b.id, reason: '' })
    if (error) { alert('Could not cancel: ' + error.message); return }
    load()
  }

  async function saveCoachNote(b, note) {
    await supabase.from('bookings').update({ coach_note: note }).eq('id', b.id)
    flash('Note saved')
  }

  async function markComplete(b) {
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', b.id)
    load()
  }

  // Coach booking on someone's behalf bypasses availability on purpose —
  // if he wants to squeeze a call in on a Sunday night, that's his call.
  async function bookForClient() {
    if (!bookFor.client_id) { alert('Pick a client.'); return }
    if (!bookFor.datetime) { alert('Pick a date and time.'); return }
    const iso = new Date(bookFor.datetime).toISOString()
    const { error } = await supabase.rpc('book_call', {
      slot_start: iso, note: bookFor.note || '', target_client_id: bookFor.client_id,
    })
    if (error) { alert('Could not book that: ' + error.message); return }
    setBookFor(null)
    load()
  }

  function copyLink(url) {
    navigator.clipboard?.writeText(url)
    flash('Link copied')
  }

  if (loading) return <div className="card muted">Loading calls…</div>
  if (!settings) return <div className="card muted">Run migration36.sql, then reload this page.</div>

  const tz = settings.timezone
  const now = Date.now()
  const upcoming = bookings.filter(b => b.status === 'booked' && new Date(b.starts_at).getTime() >= now - 36e5)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const past = bookings.filter(b => !upcoming.includes(b))
  const shown = tab === 'upcoming' ? upcoming : past
  const nameOf = id => clients.find(c => c.id === id)?.full_name || clients.find(c => c.id === id)?.email || 'Former client'

  return (
    <div>
      <div className="eyebrow">Coaching</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 6px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Calls</h1>
        {savedMsg && <span style={{ fontSize: 12, color: 'var(--green)' }}>{savedMsg}</span>}
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setShowSettings(s => !s)}>
          <Settings size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Settings
        </button>
        <button className="btn" style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setBookFor({ client_id: '', datetime: '', note: '' })}>
          <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Book for a client
        </button>
      </div>

      {/* ===== MASTER SWITCH ===== */}
      <div className="card" style={{ marginBottom: 16, borderLeft: `3px solid ${settings.booking_enabled ? 'var(--green)' : 'var(--line)'}` }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          <input type="checkbox" checked={settings.booking_enabled} style={{ width: 'auto' }}
            onChange={e => saveSettings({ booking_enabled: e.target.checked })} />
          <span>
            <strong>Let clients book calls</strong>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {settings.booking_enabled
                ? 'Clients can see your open slots and book themselves in.'
                : 'Off — clients see nothing. Set your hours below first, then switch this on.'}
            </div>
          </span>
        </label>
      </div>

      {/* ===== SETTINGS ===== */}
      {showSettings && (
        <div className="card" style={{ marginBottom: 16 }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Settings</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 8 }}>
            <div>
              <label className="muted" style={{ fontSize: 11.5 }}>Your timezone — everything below is in this zone</label>
              <select value={settings.timezone} onChange={e => saveSettings({ timezone: e.target.value })}>
                {TIMEZONES.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="muted" style={{ fontSize: 11.5 }}>Call length (minutes)</label>
              <input inputMode="numeric" value={settings.slot_minutes}
                onChange={e => setSettings({ ...settings, slot_minutes: e.target.value })}
                onBlur={e => saveSettings({ slot_minutes: Math.min(240, Math.max(10, +e.target.value || 30)) })} />
            </div>
            <div>
              <label className="muted" style={{ fontSize: 11.5 }}>Gap between calls (minutes)</label>
              <input inputMode="numeric" value={settings.buffer_minutes}
                onChange={e => setSettings({ ...settings, buffer_minutes: e.target.value })}
                onBlur={e => saveSettings({ buffer_minutes: Math.min(120, Math.max(0, +e.target.value || 0)) })} />
            </div>
            <div>
              <label className="muted" style={{ fontSize: 11.5 }}>Minimum notice (hours)</label>
              <input inputMode="numeric" value={settings.min_notice_hours}
                onChange={e => setSettings({ ...settings, min_notice_hours: e.target.value })}
                onBlur={e => saveSettings({ min_notice_hours: Math.min(336, Math.max(0, +e.target.value || 0)) })} />
            </div>
            <div>
              <label className="muted" style={{ fontSize: 11.5 }}>Book up to (days ahead)</label>
              <input inputMode="numeric" value={settings.max_days_ahead}
                onChange={e => setSettings({ ...settings, max_days_ahead: e.target.value })}
                onBlur={e => saveSettings({ max_days_ahead: Math.min(120, Math.max(1, +e.target.value || 21)) })} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="muted" style={{ fontSize: 11.5 }}>What clients see above the calendar (optional)</label>
            <textarea rows={2} value={settings.intro || ''}
              onChange={e => setSettings({ ...settings, intro: e.target.value })}
              onBlur={e => saveSettings({ intro: e.target.value })}
              placeholder="e.g. 30 minutes, camera on, bring your check-in numbers." />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Video rooms are created automatically for each call — nothing to set up, works in a browser, no accounts needed.
          </p>
        </div>
      )}

      {/* ===== BOOK FOR A CLIENT ===== */}
      {bookFor && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--orange)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Book a call for a client</span>
            <button className="btn-ghost" style={{ padding: 4 }} onClick={() => setBookFor(null)}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <select value={bookFor.client_id} onChange={e => setBookFor({ ...bookFor, client_id: e.target.value })}>
              <option value="">Pick a client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
            </select>
            <input type="datetime-local" value={bookFor.datetime}
              onChange={e => setBookFor({ ...bookFor, datetime: e.target.value })} />
            <input placeholder="What it's about (optional)" value={bookFor.note}
              onChange={e => setBookFor({ ...bookFor, note: e.target.value })} />
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            Uses your computer's clock, and ignores your set hours — you can put a call anywhere.
          </p>
          <button className="btn" style={{ marginTop: 8 }} onClick={bookForClient}>Book it</button>
        </div>
      )}

      {/* ===== WEEKLY HOURS ===== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>
          <Clock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Weekly hours ({tz.replace(/_/g, ' ')})
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {DAYS.map((day, i) => {
            const windows = avail.filter(a => a.weekday === i)
            return (
              <div key={day} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                <span style={{ minWidth: 92, fontWeight: 600, color: windows.length ? 'var(--white)' : 'var(--muted)' }}>{day}</span>
                <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {windows.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Not available</span>}
                  {windows.map(w => (
                    <span key={w.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'var(--steel)', borderRadius: 20, padding: '4px 6px 4px 11px',
                      fontSize: 12, opacity: w.active ? 1 : 0.45,
                    }}>
                      <span onClick={() => toggleSlot(w)} style={{ cursor: 'pointer' }}
                        title={w.active ? 'Click to pause this window' : 'Paused — click to switch back on'}>
                        {minLabel(w.start_minute)} – {minLabel(w.end_minute)}
                      </span>
                      <button className="btn-ghost" style={{ padding: 1, color: 'var(--muted)' }}
                        onClick={() => removeSlot(w.id)}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={newSlot.weekday} style={{ maxWidth: 140 }}
            onChange={e => setNewSlot({ ...newSlot, weekday: e.target.value })}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <input type="time" style={{ maxWidth: 120 }} value={newSlot.start}
            onChange={e => setNewSlot({ ...newSlot, start: e.target.value })} />
          <span className="muted" style={{ fontSize: 13 }}>to</span>
          <input type="time" style={{ maxWidth: 120 }} value={newSlot.end}
            onChange={e => setNewSlot({ ...newSlot, end: e.target.value })} />
          <button className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }} onClick={addSlot}>
            <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Add window
          </button>
        </div>
      </div>

      {/* ===== BLACKOUTS ===== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>
          <Plane size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Days off — travel, shows, anything
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {blackouts.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Nothing blocked out.</span>}
          {blackouts.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Calendar size={13} className="muted" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                {fmtDate(b.starts_at, tz)} – {fmtDate(new Date(new Date(b.ends_at).getTime() - 1).toISOString(), tz)}
                {b.reason && <span className="muted"> · {b.reason}</span>}
              </span>
              <button className="btn-ghost" style={{ padding: 2, color: 'var(--muted)' }}
                onClick={() => removeBlackout(b.id)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" style={{ maxWidth: 160 }} value={newBlackout.start}
            onChange={e => setNewBlackout({ ...newBlackout, start: e.target.value })} />
          <span className="muted" style={{ fontSize: 13 }}>to</span>
          <input type="date" style={{ maxWidth: 160 }} value={newBlackout.end}
            onChange={e => setNewBlackout({ ...newBlackout, end: e.target.value })} />
          <input placeholder="Reason (optional)" style={{ maxWidth: 200 }} value={newBlackout.reason}
            onChange={e => setNewBlackout({ ...newBlackout, reason: e.target.value })} />
          <button className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }} onClick={addBlackout}>
            <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Block off
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Both dates included — blocking the 3rd to the 7th takes out all five days.
        </p>
      </div>

      {/* ===== BOOKINGS ===== */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tab === 'upcoming' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setTab('upcoming')}>Upcoming ({upcoming.length})</button>
        <button className={tab === 'past' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setTab('past')}>Past &amp; cancelled ({past.length})</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.length === 0 && (
          <div className="card muted" style={{ fontSize: 13 }}>
            {tab === 'upcoming' ? 'No calls booked.' : 'Nothing here yet.'}
          </div>
        )}
        {shown.map(b => (
          <div key={b.id} className="card" style={{
            borderLeft: `3px solid ${b.status === 'cancelled' ? 'var(--red)' : b.status === 'completed' ? 'var(--line)' : 'var(--green)'}`,
            opacity: b.status === 'booked' ? 1 : 0.7,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <strong style={{ fontSize: 15 }}>{nameOf(b.client_id)}</strong>
                <div style={{ fontSize: 13, marginTop: 2 }}>{fmtDateTime(b.starts_at, tz)}</div>
                {b.status === 'cancelled' && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>
                    Cancelled{b.cancelled_by ? ` by the ${b.cancelled_by}` : ''}
                  </div>
                )}
                {b.client_note && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>“{b.client_note}”</div>}
              </div>
              {b.status === 'booked' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <a className="btn" href={b.video_url} target="_blank" rel="noreferrer"
                    style={{ padding: '7px 14px', fontSize: 13, textDecoration: 'none' }}>
                    <Video size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Join
                  </a>
                  <button className="btn-ghost" style={{ padding: '7px 11px', fontSize: 13 }}
                    title="Copy the room link" onClick={() => copyLink(b.video_url)}><Copy size={14} /></button>
                  <button className="btn-ghost" style={{ padding: '7px 11px', fontSize: 13 }}
                    onClick={() => markComplete(b)}>Done</button>
                  <button className="btn-ghost" style={{ padding: '7px 11px', fontSize: 13, color: 'var(--red)' }}
                    onClick={() => cancel(b)}>Cancel</button>
                </div>
              )}
              {b.status !== 'booked' && b.video_url && (
                <a className="muted" href={b.video_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, textDecoration: 'none' }}>
                  room <ExternalLink size={11} style={{ verticalAlign: -1 }} />
                </a>
              )}
            </div>
            <textarea rows={2} defaultValue={b.coach_note || ''} placeholder="Your notes from the call…"
              style={{ marginTop: 8, fontSize: 13 }}
              onBlur={e => { if (e.target.value !== (b.coach_note || '')) saveCoachNote(b, e.target.value) }} />
          </div>
        ))}
      </div>
    </div>
  )
}
