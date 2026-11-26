// Coach: Text Blast (Update 188). Write one message, pick clients, then send it
// as a normal text from your own phone, one tap per client. Each client gets
// a private text (no group thread, nobody sees anyone else's number), and it
// comes from your business line, so nothing to register or pay for.
// Progress is saved, so you can leave mid-blast and pick it up on any device.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquareText, Check, SkipForward, Undo2, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { smsHref } from '../../lib/checkinNag'
import { blastText, firstName, splitRecipients, recipientRows, queueRows, nextUp, blastProgress, textParts } from '../../lib/textBlast'
import RecipientPicker from './RecipientPicker'
import Avatar from '../Avatar'

const fmtWhen = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)))

export default function TextBlast() {
  const [clients, setClients] = useState([])
  const [blasts, setBlasts] = useState([])
  const [recips, setRecips] = useState([])        // recipients of every loaded blast
  const [activeId, setActiveId] = useState(null)
  const [body, setBody] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [missing, setMissing] = useState(false)   // migration not run yet
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const [{ data: cl }, bl] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, status, avatar_url, plan').eq('role', 'client').order('full_name'),
      supabase.from('text_blasts').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setClients(cl || [])
    if (bl.error) { setMissing(true); setLoaded(true); return }
    const list = bl.data || []
    setBlasts(list)
    if (list.length) {
      const { data: rs } = await supabase.from('text_blast_recipients').select('*').in('blast_id', list.map(b => b.id))
      setRecips(rs || [])
    } else setRecips([])
    setLoaded(true)
  }
  useEffect(() => {
    load()
    // coming back from Messages (or from another device): pick up the latest
    const vis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])

  const byId = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients])
  const rowsFor = id => queueRows(recips.filter(r => r.blast_id === id), byId)
  const active = blasts.find(b => b.id === activeId) || null

  async function start() {
    const text = body.trim()
    const { ready } = splitRecipients(clients, selected)
    if (!text || !ready.length) return
    setBusy(true)
    const id = newId()
    const { error } = await supabase.from('text_blasts').insert({ id, body: text })
    if (error) { setBusy(false); return alert('Could not start the blast: ' + error.message) }
    const rows = recipientRows(id, ready)
    const { error: e2 } = await supabase.from('text_blast_recipients').insert(rows)
    setBusy(false)
    if (e2) return alert('Could not save who it goes to: ' + e2.message)
    setBlasts(b => [{ id, body: text, created_at: new Date().toISOString(), finished_at: null }, ...b])
    setRecips(r => [...r, ...rows.map(x => ({ ...x, sent_at: null, skipped_at: null }))])
    setBody(''); setSelected(new Set()); setActiveId(id)
  }

  async function setRow(row, patch) {
    setRecips(rs => rs.map(r => (r.blast_id === row.blast_id && r.client_id === row.client_id ? { ...r, ...patch } : r)))
    await supabase.from('text_blast_recipients').update(patch).eq('blast_id', row.blast_id).eq('client_id', row.client_id)
    // finish automatically once nobody is left; reopen if something is undone
    const after = rowsFor(row.blast_id).map(r => (r.client_id === row.client_id ? { ...r, ...patch, state: patch.sent_at ? 'sent' : patch.skipped_at ? 'skipped' : r.number ? 'waiting' : 'nophone' } : r))
    const done = blastProgress(after).done
    const b = blasts.find(x => x.id === row.blast_id)
    if (b && done !== !!b.finished_at) await setFinished(row.blast_id, done)
  }
  async function setFinished(id, done) {
    const finished_at = done ? new Date().toISOString() : null
    setBlasts(bs => bs.map(b => (b.id === id ? { ...b, finished_at } : b)))
    await supabase.from('text_blasts').update({ finished_at }).eq('id', id)
  }
  const markSent = row => setRow(row, { sent_at: new Date().toISOString(), skipped_at: null })
  const skip = row => setRow(row, { skipped_at: new Date().toISOString(), sent_at: null })
  const undo = row => setRow(row, { sent_at: null, skipped_at: null })

  if (!loaded) return null
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <MessageSquareText size={26} color="var(--orange)" /> Text Blast
      </h1>
      <p className="muted" style={{ fontSize: 14, margin: '0 0 18px' }}>
        One message, texted to many clients from your own phone. Each client gets a private text. Open this on your business phone, tap Text, hit send, come back for the next one.
      </p>

      {missing ? (
        <div className="card">Text blasts need <b>migration_update188_text_blasts.sql</b> run in the Supabase SQL Editor first.</div>
      ) : active ? (
        <Queue blast={active} rows={rowsFor(active.id)} ua={ua} onBack={() => setActiveId(null)}
          onSent={markSent} onSkip={skip} onUndo={undo} onFinish={() => setFinished(active.id, true)} onReopen={() => setFinished(active.id, false)} />
      ) : (
        <>
          <OpenBlasts blasts={blasts.filter(b => !b.finished_at)} rowsFor={rowsFor} onOpen={setActiveId} />
          <Compose clients={clients} body={body} setBody={setBody} selected={selected} setSelected={setSelected} busy={busy} onStart={start} />
          <RecentBlasts blasts={blasts.filter(b => b.finished_at)} rowsFor={rowsFor} onOpen={setActiveId} />
        </>
      )}
    </div>
  )
}

function Compose({ clients, body, setBody, selected, setSelected, busy, onStart }) {
  const { ready, noPhone } = splitRecipients(clients, selected)
  const sample = ready[0]?.client.full_name || clients.find(c => c.status !== 'exited')?.full_name || 'Brett'
  const parts = textParts(blastText(body, sample))
  const groupIds = clients.filter(c => c.plan === 'group' && c.status !== 'exited' && c.status !== 'paused').map(c => c.id)
  const coachingIds = clients.filter(c => c.plan !== 'group' && c.status !== 'exited' && c.status !== 'paused').map(c => c.id)

  return (
    <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ fontSize: 18 }}>New text</h2>
      <textarea rows={4} placeholder="Hey {name}, quick one..." value={body} onChange={e => setBody(e.target.value)} />
      <div className="muted" style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>{'{name}'} becomes each client's first name.</span>
        {parts.chars > 0 && <span>{parts.chars} characters{parts.parts > 1 ? ` · sends as ${parts.parts} texts` : ''}</span>}
      </div>
      {body.trim() && (
        <div style={{ background: 'var(--steel)', borderRadius: 12, padding: '9px 12px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 3 }}>What {firstName(sample)} gets</div>
          {blastText(body, sample)}
        </div>
      )}

      {groupIds.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setSelected(new Set(coachingIds))}>Select 1:1 clients ({coachingIds.length})</button>
          <button type="button" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setSelected(new Set(groupIds))}>Select group members ({groupIds.length})</button>
        </div>
      )}
      <RecipientPicker clients={clients} selected={selected} onChange={setSelected} />

      {noPhone.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--orange-hot)' }}>
          No phone number for {noPhone.map(c => c.full_name || 'Unnamed client').join(', ')}, so {noPhone.length === 1 ? "they'll" : "they'll all"} be left out.{' '}
          <Link to="/coach/clients" style={{ color: 'inherit' }}>Add numbers in Clients</Link>
        </div>
      )}
      <div>
        <button className="btn" disabled={busy || !body.trim() || !ready.length} onClick={onStart} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Send size={15} /> {busy ? 'Starting…' : `Start: text ${ready.length} client${ready.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

function Queue({ blast, rows, ua, onBack, onSent, onSkip, onUndo, onFinish, onReopen }) {
  const p = blastProgress(rows)
  const next = nextUp(rows)
  const pct = p.total ? Math.round(((p.sent + p.skipped) / p.total) * 100) : 0

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '5px 10px', fontSize: 13 }}>← All blasts</button>
        <span className="muted" style={{ fontSize: 13 }}>{p.sent} of {p.total} sent{p.skipped ? ` · ${p.skipped} skipped` : ''}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--steel)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--orange)', transition: 'width .2s' }} />
      </div>

      {next ? (
        <div style={{ border: '1px solid var(--orange)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="eyebrow" style={{ fontSize: 10.5 }}>Next up</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar url={next.client.avatar_url} name={next.client.full_name} size={42} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{next.client.full_name || 'Client'}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{next.number}</div>
            </div>
          </div>
          <div style={{ background: 'var(--steel)', borderRadius: 12, padding: '9px 12px', fontSize: 14, whiteSpace: 'pre-wrap' }}>{blastText(blast.body, next.client.full_name)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn" href={smsHref(next.number, blastText(blast.body, next.client.full_name), ua)} onClick={() => onSent(next)}
              style={{ flex: 1, textAlign: 'center', textDecoration: 'none', padding: '12px 14px', fontSize: 16, fontWeight: 800 }}>
              Text {firstName(next.client.full_name) || 'client'}
            </a>
            <button className="btn-ghost" onClick={() => onSkip(next)} title="Skip" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><SkipForward size={15} /> Skip</button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Opens Messages with the text ready. Hit send, then come back here.</div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>All done ✓</div>
          <div className="muted" style={{ fontSize: 13 }}>{p.sent} sent{p.skipped ? `, ${p.skipped} skipped` : ''}{p.noPhone ? `, ${p.noPhone} with no phone number` : ''}.</div>
        </div>
      )}

      <div>
        {rows.map(r => (
          <div key={r.client_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--steel)', opacity: r.state === 'waiting' ? 1 : 0.6 }}>
            <Avatar url={r.client.avatar_url} name={r.client.full_name} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.client.full_name || 'Client'}</div>
              <div style={{ fontSize: 12 }} className={r.state === 'waiting' ? 'muted' : undefined}>
                {r.state === 'sent' ? <span style={{ color: 'var(--green)' }}>Texted {fmtWhen(r.sent_at)}</span>
                  : r.state === 'skipped' ? <span className="muted">Skipped</span>
                  : r.state === 'nophone' ? <span style={{ color: 'var(--orange-hot)' }}>No phone number</span>
                  : 'Waiting'}
              </div>
            </div>
            {r.state === 'sent' || r.state === 'skipped'
              ? <button className="btn-ghost" onClick={() => onUndo(r)} title="Undo" style={{ padding: '5px 9px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Undo2 size={14} /> Undo</button>
              : r.state === 'waiting' && r !== next
                ? <a className="btn-ghost" href={smsHref(r.number, blastText(blast.body, r.client.full_name), ua)} onClick={() => onSent(r)} style={{ padding: '5px 10px', fontSize: 12.5, textDecoration: 'none' }}>Text</a>
                : r.state === 'nophone' ? <Link to="/coach/clients" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12.5, textDecoration: 'none' }}>Add phone</Link> : null}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {blast.finished_at
          ? (p.waiting > 0 && <button className="btn-ghost" onClick={onReopen}>Reopen</button>)
          : <button className="btn-ghost" onClick={() => { if (!p.waiting || confirm(`${p.waiting} still waiting. End this blast anyway?`)) { onFinish(); onBack() } }}>End blast</button>}
      </div>
    </div>
  )
}

function OpenBlasts({ blasts, rowsFor, onOpen }) {
  if (!blasts.length) return null
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--orange)' }}>
      <h2 style={{ fontSize: 16, marginBottom: 6 }}>Pick up where you left off</h2>
      {blasts.map(b => <BlastRow key={b.id} blast={b} p={blastProgress(rowsFor(b.id))} onOpen={onOpen} action="Continue" />)}
    </div>
  )
}

function RecentBlasts({ blasts, rowsFor, onOpen }) {
  if (!blasts.length) return null
  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 6 }}>Recent blasts</h2>
      {blasts.slice(0, 8).map(b => <BlastRow key={b.id} blast={b} p={blastProgress(rowsFor(b.id))} onOpen={onOpen} action="View" />)}
    </div>
  )
}

function BlastRow({ blast, p, onOpen, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--steel)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{blast.body}</div>
        <div className="muted" style={{ fontSize: 12 }}>{fmtWhen(blast.created_at)} · {p.sent} of {p.total} sent</div>
      </div>
      <button className={action === 'Continue' ? 'btn' : 'btn-ghost'} onClick={() => onOpen(blast.id)} style={{ padding: '6px 12px', fontSize: 13 }}>{action}</button>
    </div>
  )
}
