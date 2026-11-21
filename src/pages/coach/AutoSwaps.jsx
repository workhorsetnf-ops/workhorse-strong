// Library: have Claude fill in swaps for every exercise (Update 187).
// Works through the library a batch at a time, showing progress. Swaps you
// added yourself are never changed; Claude's ones are marked "auto" and can be
// removed or added to like any other.
import { useRef, useState } from 'react'
import { callApi } from '../../lib/push'
import { needingSwaps } from '../../lib/autoSwaps'

export default function AutoSwaps({ library, alts, onChange }) {
  const [run, setRun] = useState(null)        // { done, total, added, error, finished }
  const stop = useRef(false)
  const missing = needingSwaps(library, alts).length
  const autoCount = alts.filter(a => a.source === 'auto').length

  async function go(reset) {
    if (reset && !confirm('Clear every swap Claude picked and pick them all again? Swaps you added yourself stay.')) return
    stop.current = false
    let total = reset ? library.filter(l => (l.kind || 'exercise') === 'exercise').length : missing
    let done = 0, added = 0, first = true
    setRun({ done, total, added })
    try {
      for (;;) {
        const r = await callApi('/api/swaps-ai', first && reset ? { reset: true } : {})
        if (first && reset) total = r.filled + r.left
        first = false
        done += r.filled; added += r.added
        setRun({ done, total: Math.max(total, done + r.left), added })
        if (!r.left || !r.filled || stop.current) break
      }
      setRun(s => ({ ...s, finished: true }))
    } catch (e) { setRun(s => ({ ...(s || {}), error: e.message })) }
    onChange()
  }

  if (run) {
    const pct = run.total ? Math.round((run.done / run.total) * 100) : 100
    return (
      <div className="card" style={{ marginBottom: 14, borderColor: 'var(--orange)' }}>
        <strong style={{ fontSize: 15 }}>⇄ {run.finished ? 'Swaps filled in' : 'Claude is picking swaps…'}</strong>
        <div style={{ height: 8, background: 'var(--coal)', borderRadius: 6, margin: '10px 0 6px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--orange)', transition: 'width .3s' }} />
        </div>
        <div className="muted" style={{ fontSize: 13 }}>{run.done} of {run.total} exercises · {run.added} swaps added</div>
        {run.error && <p style={{ color: 'var(--red)', fontSize: 13, margin: '8px 0 0' }}>{run.error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {!run.finished && !run.error && <button className="btn-ghost" onClick={() => { stop.current = true }}>Stop after this batch</button>}
          {(run.finished || run.error) && <button className="btn-ghost" onClick={() => setRun(null)}>Done</button>}
        </div>
        {run.finished && <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Tap ⇄ Swaps on any exercise to check or change what Claude picked. New exercises you add get theirs automatically.</p>}
      </div>
    )
  }
  if (!missing && !autoCount) return null
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
      {missing > 0 && <button className="btn" onClick={() => go(false)}>⇄ Fill in swaps with Claude ({missing} exercise{missing === 1 ? '' : 's'} without)</button>}
      {autoCount > 0 && <button className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => go(true)}>Redo Claude’s swaps</button>}
    </div>
  )
}
