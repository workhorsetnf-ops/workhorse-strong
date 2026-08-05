import { useEffect, useRef, useState } from 'react'

function parseRestSeconds(text) {
  if (!text) return 90
  const t = text.toLowerCase()
  const min = t.match(/(\d+(\.\d+)?)\s*min/)
  const sec = t.match(/(\d+)\s*sec/)
  if (min) return Math.round(parseFloat(min[1]) * 60)
  if (sec) return parseInt(sec[1])
  const bare = t.match(/(\d+)/)
  return bare ? parseInt(bare[1]) : 90
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
    setTimeout(() => ctx.close(), 400)
  } catch {}
  if (navigator.vibrate) navigator.vibrate([200, 100, 200])
}

// Small rest-timer button that expands into a countdown. restText comes from the exercise's rest field.
export default function RestTimer({ restText }) {
  const total = parseRestSeconds(restText)
  const [remaining, setRemaining] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (remaining === null) return
    if (remaining <= 0) { beep(); setRemaining(null); return }
    intervalRef.current = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(intervalRef.current)
  }, [remaining])

  function start() { setRemaining(total) }
  function stop() { clearTimeout(intervalRef.current); setRemaining(null) }
  function addTime(s) { setRemaining(r => (r === null ? total : r) + s) }

  if (remaining === null) {
    return <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 11.5 }} onClick={start}>⏱ Rest {total}s</button>
  }
  const m = Math.floor(remaining / 60), s = remaining % 60
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--steel)', borderRadius: 20, padding: '4px 4px 4px 12px' }}>
      <strong style={{ fontSize: 13, color: 'var(--orange-hot)', minWidth: 40 }}>{m}:{String(s).padStart(2,'0')}</strong>
      <button onClick={() => addTime(15)} title="+15s" style={{ background: 'none', color: 'var(--muted)', fontSize: 11, padding: '4px 6px' }}>+15</button>
      <button onClick={stop} title="Stop" style={{ background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 22, height: 22, fontSize: 11, lineHeight: 1 }}>✕</button>
    </div>
  )
}
