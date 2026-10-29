// One place that talks to the Anthropic API. Answers come back through a
// forced tool call, so the reply is always structured JSON in the shape we
// asked for, never prose. Falls back to reading JSON out of any text.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

export async function askClaude({ system, content, tool, maxTokens = 1000, fetchFn = globalThis.fetch }) {
  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': String(process.env.ANTHROPIC_API_KEY || '').trim(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content }],
    }),
  })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(out?.error?.message || `status ${r.status}`); e.status = r.status; throw e }
  const used = (out.content || []).find(c => c.type === 'tool_use' && c.name === tool.name)
  if (used?.input && typeof used.input === 'object') return { data: used.input, model: MODEL }
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
  return { data: text, model: MODEL, stop: out.stop_reason }
}
