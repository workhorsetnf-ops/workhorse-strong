import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function resolveBody(body, client) {
  return (body || '')
    .replaceAll('{{client_name}}', client?.full_name || '')
    .replaceAll('{{date}}', new Date().toLocaleDateString())
}

function StatusBadge({ status }) {
  const map = {
    sent: { label: 'Awaiting signature', bg: 'rgba(255,90,0,0.15)', color: 'var(--orange-hot)' },
    signed: { label: 'Signed', bg: 'rgba(76,175,109,0.15)', color: 'var(--green)' },
    void: { label: 'Void', bg: 'var(--steel)', color: 'var(--muted)' },
  }
  const s = map[status] || map.sent
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

export default function CoachContracts() {
  const [templates, setTemplates] = useState([])
  const [clients, setClients] = useState([])
  const [contracts, setContracts] = useState([])
  const [tplOpen, setTplOpen] = useState(false)
  const [editingTpl, setEditingTpl] = useState(null)
  const [tplForm, setTplForm] = useState({ name: '', body: '' })
  const [sendForm, setSendForm] = useState({ client_id: '', template_id: '', title: '' })

  async function load() {
    const [{ data: t }, { data: c }, { data: k }] = await Promise.all([
      supabase.from('contract_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name'),
      supabase.from('contracts').select('*').order('sent_at', { ascending: false }),
    ])
    setTemplates(t || []); setClients(c || []); setContracts(k || [])
  }
  useEffect(() => { load() }, [])

  function startNewTpl() {
    setEditingTpl(null)
    setTplForm({ name: '', body: '' })
    setTplOpen(true)
  }

  function startEditTpl(t) {
    setEditingTpl(t.id)
    setTplForm({ name: t.name, body: t.body })
    setTplOpen(true)
  }

  async function saveTpl() {
    if (!tplForm.name.trim() || !tplForm.body.trim()) { alert('Give the template a name and some body text.'); return }
    if (editingTpl) {
      await supabase.from('contract_templates').update({ name: tplForm.name.trim(), body: tplForm.body, updated_at: new Date().toISOString() }).eq('id', editingTpl)
    } else {
      await supabase.from('contract_templates').insert({ name: tplForm.name.trim(), body: tplForm.body })
    }
    setTplOpen(false); setEditingTpl(null); load()
  }

  async function deleteTpl(id) {
    if (!confirm('Delete this template? Contracts already sent from it are unaffected.')) return
    await supabase.from('contract_templates').delete().eq('id', id)
    load()
  }

  async function sendContract() {
    if (!sendForm.client_id || !sendForm.template_id) { alert('Pick a client and a template.'); return }
    const tpl = templates.find(t => t.id === sendForm.template_id)
    const client = clients.find(c => c.id === sendForm.client_id)
    if (!tpl || !client) return
    const body = resolveBody(tpl.body, client)
    const title = sendForm.title.trim() || tpl.name
    const { error } = await supabase.from('contracts').insert({
      template_id: tpl.id, client_id: client.id, title, body, status: 'sent',
    })
    if (error) { alert('Could not send: ' + error.message); return }
    setSendForm({ client_id: '', template_id: '', title: '' })
    load()
  }

  async function voidContract(id) {
    if (!confirm('Void this contract? The client will no longer be able to sign it.')) return
    await supabase.from('contracts').update({ status: 'void' }).eq('id', id)
    load()
  }

  const clientsById = Object.fromEntries(clients.map(c => [c.id, c]))
  const previewClient = clients.find(c => c.id === sendForm.client_id)
  const previewTpl = templates.find(t => t.id === sendForm.template_id)

  return (
    <div>
      <div className="eyebrow">Paperwork</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Contracts</h1>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18 }}>Templates</h2>
        <button className="btn-ghost" onClick={startNewTpl}>+ New template</button>
      </div>

      {tplOpen && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input placeholder="Template name (e.g. Standard Training Agreement)" value={tplForm.name} onChange={e => setTplForm({ ...tplForm, name: e.target.value })} />
          <textarea rows="10" placeholder="Contract text… use {{client_name}} and {{date}} — they'll be filled in automatically when you send it."
            value={tplForm.body} onChange={e => setTplForm({ ...tplForm, body: e.target.value })} style={{ fontFamily: 'inherit', lineHeight: 1.5 }} />
          <p className="muted" style={{ fontSize: 12 }}>Placeholders: <code>{'{{client_name}}'}</code> and <code>{'{{date}}'}</code>.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={saveTpl}>Save template</button>
            <button className="btn-ghost" onClick={() => setTplOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {templates.map(t => (
          <div className="card" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 14.5 }}>{t.name}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.body.length} characters</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => startEditTpl(t)}>Edit</button>
              <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => deleteTpl(t.id)}>Delete</button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <div className="card muted">No templates yet — create one above.</div>}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Send a contract</h2>
      <div className="card" style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={sendForm.client_id} onChange={e => setSendForm({ ...sendForm, client_id: e.target.value })}>
            <option value="">Select client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
          </select>
          <select value={sendForm.template_id} onChange={e => setSendForm({ ...sendForm, template_id: e.target.value })}>
            <option value="">Select template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <input placeholder="Title (optional — defaults to the template name)" value={sendForm.title} onChange={e => setSendForm({ ...sendForm, title: e.target.value })} />
        {previewTpl && (
          <div className="muted" style={{ fontSize: 12.5, background: 'var(--steel)', borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto' }}>
            {resolveBody(previewTpl.body, previewClient)}
          </div>
        )}
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={sendContract}>Send to client</button>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Sent contracts</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {contracts.map(k => (
          <div className="card" key={k.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong style={{ fontSize: 14.5 }}>{clientsById[k.client_id]?.full_name || 'Client'}</strong>
                <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{k.title}</span>
              </div>
              <StatusBadge status={k.status} />
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              Sent {new Date(k.sent_at).toLocaleDateString()}
              {k.status === 'signed' && k.signed_at && <> · Signed {new Date(k.signed_at).toLocaleDateString()} by {k.signature_name}</>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Link to={`/coach/contracts/print/${k.id}`} target="_blank" className="btn-ghost" style={{ textDecoration: 'none' }}>View / Print</Link>
              {k.status === 'sent' && <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => voidContract(k.id)}>Void</button>}
            </div>
          </div>
        ))}
        {contracts.length === 0 && <div className="card muted">Nothing sent yet.</div>}
      </div>
    </div>
  )
}
