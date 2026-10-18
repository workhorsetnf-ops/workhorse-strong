// Work/rest interval timer for timed exercises (conditioning): runs every
// round for the client — WORK countdown, then REST, then the next round —
// with a beep at each change, and fills in each round's time when it's done.
import { useEffect, useRef, useState } from 'react'

export function secondsOf(text) {
  const t = String(text || '').toLowerCase().trim()
  let m = t.match(/^(\d+):([0-5]\d)$/)
  if (m) return +m[1] * 60 + +m[2]
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\b/)
  if (m) return Math.round(+m[1] * 60)
  m = t.match(/(\d+(?:\.\d+)?)/)
  return m ? Math.round(+m[1]) : 0
}
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const nice = s => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : s > 120 ? clock(s) : `${s}s`)

function beep(freq = 880, ms = 250) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination); o.frequency.value = freq
    g.gain.setValueAtTime(0.18, ctx.currentTime); o.start(); o.stop(ctx.currentTime + ms / 1000)
    setTimeout(() => ctx.close(), ms + 150)
  } catch { /* no audio */ }
  if (navigator.vibrate) navigator.vibrate(freq > 900 ? [250, 100, 250] : 120)
}

// rounds: number of rounds; work/rest: seconds (or text like "20s", "2 min")
export default function IntervalTimer({ rounds, work, rest, onRoundDone }) {
  const W = secondsOf(work), R = secondsOf(rest)
  const [st, setSt] = useState(null)   // { round, phase: 'work'|'rest', ends, paused, left }
  const [now, setNow] = useState(Date.now())
  const tick = useRef(null)

  useEffect(() => {
    if (!st || st.paused) return
    tick.current = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick.current)
  }, [st])

  const left = st ? (st.paused ? st.left : Math.max(0, Math.ceil((st.ends - now) / 1000))) : 0
  useEffect(() => {
    if (!st || st.paused) return
    if (left > 0 && left <= 3) { /* countdown pips */ }
    if (left > 0) return
    if (st.phase === 'work') {
      onRoundDone?.(st.round - 1, W)
      if (st.round >= rounds) { beep(1200, 600); setSt(null); return }
      if (R > 0) { beep(660); setSt({ round: st.round, phase: 'rest', ends: Date.now() + R * 1000 }) }
      else { beep(1200); setSt({ round: st.round + 1, phase: 'work', ends: Date.now() + W * 1000 }) }
    } else {
      beep(1200); setSt({ round: st.round + 1, phase: 'work', ends: Date.now() + W * 1000 })
    }
  }, [left]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3-2-1 pips before each change
  const lastPip = useRef(null)
  useEffect(() => {
    if (!st || st.paused || left > 3 || left < 1) return
    const k = `${st.round}-${st.phase}-${left}`
    if (lastPip.current !== k) { lastPip.current = k; beep(440, 90) }
  }, [left, st])

  if (!W) return null
  const summary = `${rounds} round${rounds === 1 ? '' : 's'} · ${nice(W)} work${R ? ` · ${nice(R)} rest` : ''}`

  if (!st) {
    return (
      <button className="btn" onClick={() => { beep(1200); setSt({ round: 1, phase: 'work', ends: Date.now() + W * 1000 }); setNow(Date.now()) }}
        style={{ width: '100%', margin: '4px 0 8px', display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
        ▶ Start intervals <span style={{ fontWeight: 600, opacity: 0.9, textTransform: 'none', letterSpacing: 0 }}>({summary})</span>
      </button>
    )
  }
  const working = st.phase === 'work'
  const total = working ? W : R
  const pct = total ? (1 - left / total) * 100 : 0
  return (
    <div style={{ margin: '4px 0 8px', borderRadius: 12, padding: '12px 14px', background: working ? 'rgba(255,106,0,0.16)' : 'var(--steel)', border: `1px solid ${working ? 'var(--orange)' : 'var(--line)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 22, letterSpacing: '.06em', color: working ? 'var(--orange-hot)' : 'var(--muted)' }}>{working ? 'WORK' : 'REST'}</span>
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Round {st.round} of {rounds}</span>
      </div>
      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 56, lineHeight: 1.05, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{clock(left)}</div>
      <div style={{ height: 6, background: 'rgba(0,0,0,0.35)', borderRadius: 3, overflow: 'hidden', margin: '4px 0 10px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: working ? 'var(--orange)' : 'var(--muted)', transition: 'width .25s linear' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setSt(s => (s.paused ? { ...s, paused: false, ends: Date.now() + s.left * 1000 } : { ...s, paused: true, left }))}>{st.paused ? '▶ Resume' : '❚❚ Pause'}</button>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setSt(s => ({ ...s, paused: false, ends: Date.now() }))}>Skip ⏭</button>
        <button className="btn-ghost" style={{ flex: 1, color: 'var(--red)' }} onClick={() => setSt(null)}>Stop</button>
      </div>
    </div>
  )
}
