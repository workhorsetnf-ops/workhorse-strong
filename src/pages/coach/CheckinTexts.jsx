// Coach Home: "Check-in texts" (Update 158). Everyone whose check-in is due
// today (or up to a week late) and not submitted yet, each with a Text button
// that opens Messages on the coach's phone with their number and a reminder
// already typed. Sent from his own number, so nothing to register or pay for.
// Clients drop off the list the moment they submit.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquareText, Copy, Check, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { textList, textSlot, messageFor, smsHref, DEFAULT_TEXTS } from '../../lib/checkinNag'
import Avatar from '../Avatar'

const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function CheckinTexts() {
  const today = localDateStr()
  const [slot, setSlot] = useState(() => textSlot())
  const [clients, setClients] = useState([])
  const [last, setLast] = useState({})
  const [sent, setSent] = useState({})            // `${id}|${slot}` -> texted_at
  const [texts, setTexts] = useState(DEFAULT_TEXTS)
  const [settingsOk, setSettingsOk] = useState(true)
  const [editing, setEditing] = useState(null)    // draft texts while editing
  const [copied, setCopied] = useState(null)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const [{ data: cl }, { data: ck }, tx, st] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, status, checkin_day, checkin_frequency, start_date, avatar_url').eq('role', 'client'),
      supabase.from('checkins').select('client_id, submitted_at').gte('submitted_at', addDays(today, -60)).order('submitted_at', { ascending: false }),
      supabase.from('checkin_texts').select('client_id, slot, texted_at').eq('for_date', today),
      supabase.from('checkin_text_settings').select('*').eq('id', 1).maybeSingle(),
    ])
    const l = {}
    for (const c of ck || []) if (!l[c.client_id]) l[c.client_id] = localDateStr(new Date(c.submitted_at))
    setClients(cl || []); setLast(l)
    if (!tx.error) setSent(Object.fromEntries((tx.data || []).map(r => [`${r.client_id}|${r.slot}`, r.texted_at])))
    if (st.error) setSettingsOk(false)
    else if (st.data) setTexts({ morning: st.data.morning_text || DEFAULT_TEXTS.morning, evening: st.data.evening_text || DEFAULT_TEXTS.evening, late: st.data.late_text || DEFAULT_TEXTS.late })
    setLoaded(true)
  }
  useEffect(() => { load() }, [])

  async function markTexted(id) {
    const key = `${id}|${slot}`
    const at = new Date().toISOString()
    setSent(s => ({ ...s, [key]: at }))
    await supabase.from('checkin_texts').upsert({ client_id: id, for_date: today, slot, texted_at: at })
  }
  async function unmark(id) {
    const key = `${id}|${slot}`
    setSent(s => { const n = { ...s }; delete n[key]; return n })
    await supabase.from('checkin_texts').delete().eq('client_id', id).eq('for_date', today).eq('slot', slot)
  }
  async function copy(row, body) {
    try { await navigator.clipboard.writeText(body); setCopied(row.client.id); setTimeout(() => setCopied(null), 1500) } catch { /* ignore */ }
  }
  async function saveTexts() {
    const next = { morning: editing.morning.trim() || DEFAULT_TEXTS.morning, evening: editing.evening.trim() || DEFAULT_TEXTS.evening, late: editing.late.trim() || DEFAULT_TEXTS.late }
    const { error } = await supabase.from('checkin_text_settings').upsert({ id: 1, morning_text: next.morning, evening_text: next.evening, late_text: next.late, updated_at: new Date().toISOString() })
    if (error) return alert(error.message)
    setTexts(next); setEditing(null)
  }

  if (!loaded) return null
  const sentSet = new Set(Object.keys(sent))
  const rows = textList(clients, last, today, sentSet, slot)
  const left = rows.filter(r => !r.texted).length
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquareText size={20} color="var(--orange)" />
          <h2 style={{ fontSize: 18 }}>Check-in texts</h2>
          {rows.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{left ? `${left} to send` : 'all sent ✓'}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['morning', 'evening'].map(s => (
            <button key={s} onClick={() => setSlot(s)} className={slot === s ? 'btn' : 'btn-ghost'} style={{ padding: '5px 12px', fontSize: 13 }}>{s === 'morning' ? 'Morning' : 'Last call'}</button>
          ))}
          {settingsOk && <button className="btn-ghost" title="Edit the texts" onClick={() => setEditing(editing ? null : { ...texts })} style={{ padding: '5px 9px' }}><Pencil size={15} /></button>}
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div className="muted" style={{ fontSize: 12.5 }}>{'{name}'} becomes their first name; {'{late}'} becomes "2 days".</div>
          {[['morning', 'Morning (due today)'], ['evening', 'Last call (due today, after 3pm)'], ['late', 'Late (past their day)']].map(([k, label]) => (
            <div key={k}>
              <label className="muted" style={{ fontSize: 12.5 }}>{label}</label>
              <textarea rows={3} value={editing[k]} onChange={e => setEditing({ ...editing, [k]: e.target.value })} style={{ width: '100%' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={saveTexts}>Save texts</button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 14, marginTop: 10 }}>Nobody's check-in is due today. 👊</div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {rows.map(r => {
            const body = messageFor(r, slot, texts)
            const at = sent[`${r.client.id}|${slot}`]
            return (
              <div key={r.client.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--steel)', opacity: at ? 0.55 : 1 }}>
                <Avatar url={r.client.avatar_url} name={r.client.full_name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.client.full_name || 'Client'}</div>
                  <div style={{ fontSize: 12.5, color: r.state === 'late' ? 'var(--red)' : 'var(--orange-hot)' }}>
                    {r.state === 'late' ? `${r.lateDays} day${r.lateDays === 1 ? '' : 's'} late` : 'Due today'}
                    {at && <span className="muted"> · texted {fmtTime(at)}</span>}
                  </div>
                </div>
                {!r.number ? (
                  <Link to="/coach/clients" className="btn-ghost" style={{ textDecoration: 'none', padding: '6px 10px', fontSize: 12.5 }}>Add phone</Link>
                ) : (
                  <>
                    <button className="btn-ghost" title="Copy the text" onClick={() => copy(r, body)} style={{ padding: '6px 9px' }}>
                      {copied === r.client.id ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                    {at
                      ? <button className="btn-ghost" onClick={() => unmark(r.client.id)} style={{ padding: '6px 12px', fontSize: 13 }}>Undo</button>
                      : <a className="btn" href={smsHref(r.number, body, ua)} onClick={() => markTexted(r.client.id)} style={{ textDecoration: 'none', padding: '6px 14px', fontSize: 13 }}>Text</a>}
                  </>
                )}
              </div>
            )
          })}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Opens Messages on your phone with the text ready. Hit send, then come back here for the next one.</div>
        </div>
      )}
    </div>
  )
}
