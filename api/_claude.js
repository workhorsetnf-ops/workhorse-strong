// One place that talks to the Anthropic API. Uses structured outputs
// (output_config.format = json_schema), so Claude's reply is always valid JSON
// in the exact shape we ask for. Never prose.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

// maxTokens is a ceiling, not a target: you only pay for what Claude actually
// writes. Newer models can spend part of it thinking before they answer, so a
// tight limit cuts the answer off. If that still happens, it retries once with
// double the room before giving up.
export async function askClaude({ system, content, tool, maxTokens = 4000, fetchFn = globalThis.fetch }) {
  try { return await callOnce({ system, content, tool, maxTokens, fetchFn }) }
  catch (e) {
    if (!e.cutOff) throw e
    return await callOnce({ system, content, tool, maxTokens: maxTokens * 2, fetchFn })
  }
}

async function callOnce({ system, content, tool, maxTokens, fetchFn }) {
  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': String(process.env.ANTHROPIC_API_KEY || '').trim(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system,
      output_config: { format: { type: 'json_schema', schema: tool.schema } },
      messages: [{ role: 'user', content }],
    }),
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(out?.error?.message || `status ${r.status}`); e.status = r.status; throw e }
  if (out.stop_reason === 'refusal') throw new Error('Claude declined to answer this one.')
  if (out.stop_reason === 'max_tokens') { const e = new Error('The answer was too long and got cut off. Try again, and if it keeps happening, tell Claude.'); e.cutOff = true; throw e }
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
  let data = text
  try { data = JSON.parse(text) } catch { /* parsers below try to recover JSON from the text */ }
  return { data, model: MODEL }
}
