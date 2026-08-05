import { useState } from 'react'

const PLATES = [45, 35, 25, 10, 5, 2.5]
const COLORS = { 45: '#BF5700', 35: '#4A6FA5', 25: '#3E8E7E', 10: 'var(--white)', 5: '#7C5CBF', 2.5: 'var(--muted)' }

function calc(target, bar) {
  let perSide = (target - bar) / 2
  if (perSide <= 0) return []
  const used = []
  for (const p of PLATES) {
    while (perSide >= p - 0.001) { used.push(p); perSide -= p }
  }
  return used
}

// Small inline plate-math button + popover, given a target weight.
export default function PlateCalc({ weight }) {
  const [open, setOpen] = useState(false)
  const [bar, setBar] = useState(45)
  const target = +weight || 0
  const plates = calc(target, bar)

  if (!open) {
    return <button className="btn-ghost" style={{ padding: '5px 9px', fontSize: 11 }} title="Plate calculator" onClick={() => setOpen(true)}>🔢</button>
  }
  return (
    <div style={{ background: 'var(--steel)', borderRadius: 8, padding: 10, marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Plates for {target || '—'} lbs</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', color: 'var(--muted)', fontSize: 12 }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>Bar:</span>
        {[45, 35, 15].map(b => (
          <button key={b} className={bar === b ? 'btn' : 'btn-ghost'} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setBar(b)}>{b}</button>
        ))}
      </div>
      {!target ? <p className="muted" style={{ fontSize: 12 }}>Enter a weight above first.</p> :
        plates.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Bar only.</p> : (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          {plates.map((p, i) => (
            <span key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: COLORS[p], color: p === 10 ? '#000' : '#fff', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 800 }}>{p}</span>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Per side, {bar}lb bar</p>
    </div>
  )
}
