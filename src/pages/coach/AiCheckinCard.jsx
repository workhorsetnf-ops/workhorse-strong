// Review page: AI read of the week plus a reply drafted in Anthony's voice.
// Edit the draft, then send it as the check-in feedback or as a message.
import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Send, MessageCircle, Mic } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callApi, notifyEvent } from '../../lib/push'
import { useAuth } from '../../context/AuthContext'
import { checkinFacts } from '../../lib/aiCheckin'
import { coachBadgesChanged } from '../../lib/coachBadges'

export default function AiCheckinCard({ profile, review, checkin, weekStart, onFeedbackSaved }) {
  const { profile: me } = useAuth()
  const [ai, setAi] = useState(checkin?.ai_summary || null)
  const [draft, setDraft] = useState(checkin?.ai_summary?.reply || '')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null)

  useEffect(() => { setAi(checkin?.ai_summary || null); setDraft(checkin?.ai_summary?.reply || ''); setNote(null) }, [checkin?.id, weekStart])

  async function run(refresh = false) {
    setBusy('ai'); setNote(null)
    try {
      const facts = checkinFacts({ profile, review, checkin, weekStart })
      const out = await callApi('/api/checkin-ai', { checkinId: checkin?.id || null, clientId: profile?.id || null, facts, refresh })
      setAi(out); setDraft(out.reply || '')
    } catch (e) { setNote({ ok: false, text: e.message }) }
    setBusy('')
  }

  // Keep the AI's draft next to what actually went out, so future drafts learn
  // from Anthony's edits (Update 161). Never blocks the send.
  async function logReply(channel, sent) {
    if (!ai?.reply || !profile?.id) return
    try { await supabase.from('ai_replies').insert({ checkin_id: checkin?.id || null, client_id: profile.id, draft: ai.reply, sent, channel }) } catch { /* ignore */ }
  }

  async function sendFeedback() {
    if (!draft.trim() || !checkin) return
    setBusy('fb')
    const { error } = await supabase.from('checkins').update({ coach_feedback: draft.trim() }).eq('id', checkin.id)
    setBusy('')
    if (error) return setNote({ ok: false, text: 'Could not save: ' + error.message })
    logReply('feedback', draft.trim())
    setNote({ ok: true, text: 'Saved as their check-in feedback.' })
    coachBadgesChanged()
    onFeedbackSaved?.(draft.trim())
  }

  async function sendMessage() {
    if (!draft.trim() || !me) return
    setBusy('msg')
    const { error } = await supabase.from('messages').insert({ sender_id: me.id, recipient_id: profile.id, body: draft.trim() })
    setBusy('')
    if (error) return setNote({ ok: false, text: 'Could not send: ' + error.message })
    notifyEvent('message', { to: profile.id })
    logReply('message', draft.trim())
    setNote({ ok: true, text: 'Sent to their Messages.' })
  }

  const already = checkin?.coach_feedback
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Sparkles size={16} color="var(--orange)" /> AI read of the week</strong>
        {ai && <button className="btn-ghost" onClick={() => run(true)} disabled={!!busy} style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> {busy === 'ai' ? 'Working…' : 'Redo'}</button>}
      </div>

      {!ai && (
        <div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            {checkin ? 'Summarize their week and draft a reply you can edit and send.' : 'No check-in this week yet. You can still get a read on their week.'}
          </p>
          <button className="btn" onClick={() => run(false)} disabled={!!busy}>{busy === 'ai' ? 'Reading the week…' : 'Summarize & draft reply'}</button>
        </div>
      )}

      {ai && (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.55 }}>
            {ai.summary.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          {ai.watch?.length > 0 && (
            <div style={{ fontSize: 13.5, background: 'rgba(229,72,77,.1)', borderRadius: 8, padding: '8px 10px' }}>
              <strong style={{ color: '#e5484d' }}>Watch:</strong> {ai.watch.join(' · ')}
            </div>
          )}
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Draft reply · edit before sending</div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={7} style={{ width: '100%', fontSize: 14, lineHeight: 1.5 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {checkin && <button className="btn" onClick={sendFeedback} disabled={!!busy || !draft.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={14} /> {busy === 'fb' ? 'Saving…' : already ? 'Replace check-in feedback' : 'Send as check-in feedback'}</button>}
            <button className={checkin ? 'btn-ghost' : 'btn'} onClick={sendMessage} disabled={!!busy || !draft.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageCircle size={14} /> {busy === 'msg' ? 'Sending…' : 'Send as message'}</button>
          </div>
        </>
      )}
      {note && <p style={{ fontSize: 13, color: note.ok ? 'var(--green)' : 'var(--red)', margin: 0 }}>{note.text}</p>}
      <VoiceGuide />
    </div>
  )
}

const GUIDE_HINT = `How I open a reply:
How I sign off (or don't):
Phrases I actually use:
Words I never use:
When someone's crushing it, I:
When someone's slipping, I:
Emoji / caps / punctuation habits:`

// Anthony's own notes on how he talks. Sent with every draft (Update 161).
function VoiceGuide() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [state, setState] = useState('')

  async function load() {
    setOpen(true); setState('loading')
    const { data, error } = await supabase.from('coach_voice').select('guide').eq('id', 1).maybeSingle()
    if (error) return setState('Could not load your voice guide. Has migration_update161 been run?')
    setText(data?.guide || ''); setSaved(data?.guide || ''); setState('')
  }
  async function save() {
    setState('saving')
    const { error } = await supabase.from('coach_voice').upsert({ id: 1, guide: text.trim(), updated_at: new Date().toISOString() })
    if (error) return setState('Could not save: ' + error.message)
    setSaved(text.trim()); setState('saved')
  }

  if (!open) return (
    <button className="btn-ghost" onClick={load} style={{ alignSelf: 'flex-start', padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
      <Mic size={13} /> My voice guide</button>
  )
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>My voice guide</div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 6px' }}>
        How you actually talk to clients. Every draft follows this, and it learns from the edits you make before sending.
      </p>
      <textarea value={text} onChange={e => { setText(e.target.value); if (state === 'saved') setState('') }} rows={9} placeholder={GUIDE_HINT}
        disabled={state === 'loading'} style={{ width: '100%', fontSize: 14, lineHeight: 1.5 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        <button className="btn" onClick={save} disabled={state === 'saving' || state === 'loading' || text.trim() === saved}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
        {state === 'saved' && <span style={{ fontSize: 13, color: 'var(--green)' }}>Saved. Hit Redo to get a new draft with it.</span>}
        {state && !['saved', 'saving', 'loading'].includes(state) && <span style={{ fontSize: 13, color: 'var(--red)' }}>{state}</span>}
      </div>
    </div>
  )
}
