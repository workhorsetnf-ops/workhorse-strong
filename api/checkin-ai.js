// AI summary + drafted reply for one weekly check-in (Update 144). Coach only.
//   POST { checkinId, facts, refresh? }  (facts built by src/lib/aiCheckin.js on the review page)
// Saved onto the check-in (ai_summary) so reopening the review costs nothing.
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional).
import { admin, userFromReq } from './_push.js'
import { buildPrompt, parseAi, SUMMARY_TOOL } from '../src/lib/aiCheckin.js'
import { askClaude } from './_claude.js'


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me || me.role !== 'coach') return res.status(403).json({ error: 'Coach only' })
    return await runCheckinAi(sb, req.body || {}, res)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

export async function runCheckinAi(sb, body, res, fetchFn = globalThis.fetch) {
  {
    const { checkinId, facts, refresh } = body
    if (!facts || typeof facts !== 'object') return res.status(400).json({ error: 'Missing week data' })

    let ck = null
    if (checkinId) {
      const { data } = await sb.from('checkins').select('id, client_id, ai_summary').eq('id', checkinId).maybeSingle()
      if (!data) return res.status(404).json({ error: 'Check-in not found' })
      ck = data
      if (ck.ai_summary && !refresh) return res.json({ ...ck.ai_summary, cached: true })
    }
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'AI is not set up yet. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.' })

    // Anthony's own recent replies, so drafts sound like him.
    const { data: past } = await sb.from('checkins').select('coach_feedback').not('coach_feedback', 'is', null)
      .order('submitted_at', { ascending: false }).limit(30)
    const examples = (past || []).map(p => String(p.coach_feedback || '').trim()).filter(t => t.length >= 60).slice(0, 5).map(t => t.slice(0, 700))
    let pain = []
    if (ck) {
      const { data: flags } = await sb.from('exercise_flags').select('note, program_exercises(name)').eq('client_id', ck.client_id).eq('resolved', false).limit(5)
      pain = (flags || []).map(f => `${f.program_exercises?.name || 'exercise'}: ${String(f.note || '').slice(0, 200)}`)
    }

    const { system, user } = buildPrompt(facts, examples, pain)
    let ans
    try { ans = await askClaude({ system, content: user, tool: SUMMARY_TOOL, maxTokens: 1200, fetchFn }) }
    catch (e) { return res.status(502).json({ error: `AI request failed: ${e.message}` }) }
    const result = { ...parseAi(ans.data), model: ans.model }

    if (ck) await sb.from('checkins').update({ ai_summary: result, ai_summary_at: new Date().toISOString() }).eq('id', ck.id)
    return res.json(result)
  }
}
