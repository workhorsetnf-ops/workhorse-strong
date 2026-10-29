// Review page: AI read of the week plus a reply drafted in Anthony's voice.
// Edit the draft, then send it as the check-in feedback or as a message.
import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Send, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callApi, notifyEvent } from '../../lib/push'
import { useAuth } from '../../context/AuthContext'
import { checkinFacts } from '../../lib/aiCheckin'

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
      const out = await callApi('/api/checkin-ai', { checkinId: checkin?.id || null, facts, refresh })
      setAi(out); setDraft(out.reply || '')
    } catch (e) { setNote({ ok: false, text: e.message }) }
    setBusy('')
  }

  async function sendFeedback() {
    if (!draft.trim() || !checkin) return
    setBusy('fb')
    const { error } = await supabase.from('checkins').update({ coach_feedback: draft.trim() }).eq('id', checkin.id)
    setBusy('')
    if (error) return setNote({ ok: false, text: 'Could not save: ' + error.message })
    setNote({ ok: true, text: 'Saved as their check-in feedback.' })
    onFeedbackSaved?.(draft.trim())
  }

  async function sendMessage() {
    if (!draft.trim() || !me) return
    setBusy('msg')
    const { error } = await supabase.from('messages').insert({ sender_id: me.id, recipient_id: profile.id, body: draft.trim() })
    setBusy('')
    if (error) return setNote({ ok: false, text: 'Could not send: ' + error.message })
    notifyEvent('message', { to: profile.id })
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
    </div>
  )
}
