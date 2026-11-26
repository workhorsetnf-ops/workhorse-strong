// Update 188: text blasts. One message to many clients, sent from the coach's
// own phone one tap at a time (same sms: link as the Update 158 check-in
// texts), so every client gets a private text and nothing needs registering.
import { smsNumber, fillText } from './checkinNag.js'

export const firstName = n => String(n || '').trim().split(/\s+/)[0] || ''

// The text one client gets: {name} -> their first name.
export const blastText = (template, name) => fillText(template, { name })

// Selected clients split into who can be texted and who has no usable number.
export function splitRecipients(clients, selectedIds) {
  const sel = new Set(selectedIds)
  const ready = [], noPhone = []
  for (const c of clients || []) {
    if (!sel.has(c.id)) continue
    const number = smsNumber(c.phone)
    if (number) ready.push({ client: c, number })
    else noPhone.push(c)
  }
  const byName = (a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''))
  ready.sort((a, b) => byName(a.client, b.client))
  noPhone.sort(byName)
  return { ready, noPhone }
}

// Rows to insert for a new blast, in the order they'll be texted.
export const recipientRows = (blastId, ready) =>
  ready.map((r, i) => ({ blast_id: blastId, client_id: r.client.id, position: i }))

// One blast's queue. recipients: rows from text_blast_recipients.
// Phone numbers are read live from the client, so fixing a number mid-blast works.
export function queueRows(recipients, clientsById) {
  return [...(recipients || [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(r => {
      const client = clientsById[r.client_id] || { id: r.client_id, full_name: 'Removed client' }
      const number = smsNumber(client.phone)
      const state = r.sent_at ? 'sent' : r.skipped_at ? 'skipped' : number ? 'waiting' : 'nophone'
      return { ...r, client, number, state }
    })
}

export const nextUp = rows => rows.find(r => r.state === 'waiting') || null

export function blastProgress(rows) {
  const n = s => rows.filter(r => r.state === s).length
  const sent = n('sent'), skipped = n('skipped'), waiting = n('waiting'), noPhone = n('nophone')
  return { total: rows.length, sent, skipped, waiting, noPhone, done: waiting === 0 }
}

// How many texts the carrier will split it into. Plain text fits 160
// characters (153 per part once split); any emoji or special character drops
// that to 70 (67 per part).
const GSM = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/
export function textParts(text) {
  const s = String(text || '')
  if (!s) return { chars: 0, parts: 0, plain: true }
  const plain = GSM.test(s)
  const chars = [...s].length
  const one = plain ? 160 : 70, each = plain ? 153 : 67
  return { chars, parts: chars <= one ? 1 : Math.ceil(chars / each), plain }
}
