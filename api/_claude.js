// One place that talks to the Anthropic API. Uses structured outputs
// (output_config.format = json_schema), so Claude's reply is always valid JSON
// in the exact shape we ask for. Never prose.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

export async function askClaude({ system, content, tool, maxTokens = 1000, fetchFn = globalThis.fetch }) {
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
  if (out.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Try again.')
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
  let data = text
  try { data = JSON.parse(text) } catch { /* parsers below try to recover JSON from the text */ }
  return { data, model: MODEL }
}
