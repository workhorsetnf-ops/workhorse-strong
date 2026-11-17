// Kit (email) from the server (Update 184). Env: KIT_API_KEY (a v4 API key from
// Kit > Settings > Developer). Used to drop new clients into the onboarding
// sequences; the emails themselves live in Kit.
const BASE = 'https://api.kit.com/v4'

export function kitReady() { return !!String(process.env.KIT_API_KEY || '').trim() }

export async function kit(path, { method = 'POST', body, fetchFn = globalThis.fetch } = {}) {
  const key = String(process.env.KIT_API_KEY || '').trim()
  if (!key) throw Object.assign(new Error('Kit isn’t connected yet (KIT_API_KEY missing).'), { status: 400 })
  const r = await fetchFn(`${BASE}/${path}`, {
    method,
    headers: { 'X-Kit-Api-Key': key, Accept: 'application/json', ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j?.errors?.join?.(' ') || j?.error || `Kit error ${r.status}`), { status: 502 })
  return j
}

// Create or update the subscriber (Kit upserts by email), set their custom
// fields, then put them in the sequence. Fields must already exist in Kit.
export async function kitSubscribeToSequence({ email, firstName, fields = {}, sequenceId }, { fetchFn } = {}) {
  const created = await kit('subscribers', { fetchFn, body: { email_address: email, first_name: firstName || undefined, state: 'active', fields } })
  const id = created?.subscriber?.id
  // the upsert may leave an existing subscriber's fields alone, so set them outright
  if (id && Object.keys(fields).length) await kit(`subscribers/${id}`, { method: 'PUT', fetchFn, body: { email_address: email, first_name: firstName || undefined, fields } })
  if (sequenceId) await kit(`sequences/${sequenceId}/subscribers`, { fetchFn, body: { email_address: email } })
  return { subscriberId: id || null }
}

export async function kitSequences({ fetchFn } = {}) {
  const j = await kit('sequences?per_page=100', { method: 'GET', fetchFn })
  return (j.sequences || []).map(s => ({ id: s.id, name: s.name }))
}

export const firstNameOf = full => String(full || '').trim().split(/\s+/)[0] || ''
