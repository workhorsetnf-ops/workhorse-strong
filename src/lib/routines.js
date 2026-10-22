// Saved warm-ups and cool-downs (routine_library). Loading one into a workout
// copies its text and video, so later library edits never touch programs that
// already use it.

export const ROUTINE_KINDS = { warmup: 'Warm-up', cooldown: 'Cool-down' }

const norm = s => String(s || '').trim().replace(/^@\s*/, '').replace(/^["“']|["”']$/g, '').trim().toLowerCase()

// In a pasted block, "Warm-up: Upper Prep" (or "@Upper Prep") that matches a
// saved name pulls in the whole saved routine; anything else is used as typed.
export function resolveRoutine(text, library, kind) {
  const raw = String(text || '')
  if (!raw.trim() || raw.includes('\n')) return { body: raw, video: '', saved: null }
  const hit = (library || []).find(r => r.kind === kind && norm(r.name) === norm(raw))
  return hit ? { body: hit.body, video: hit.video_url || '', saved: hit } : { body: raw, video: '', saved: null }
}
