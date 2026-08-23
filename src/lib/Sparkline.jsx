// Lightweight dependency-free line chart
export default function Sparkline({ data, height = 90, color = '#FF5A00', unit = '' }) {
  const points = data.filter(d => d.value !== null && d.value !== undefined && d.value !== '')
  if (points.length < 2) {
    return <div style={{ height, display: 'grid', placeItems: 'center' }} className="muted">
      <span style={{ fontSize: 12.5 }}>Log a few more entries to see a trend</span>
    </div>
  }
  const vals = points.map(p => +p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const pad = (max - min) * 0.15 || 1
  const lo = min - pad, hi = max + pad
  const w = 300
  const stepX = w / (points.length - 1)
  const y = v => height - ((v - lo) / (hi - lo)) * height
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${y(+p.value)}`).join(' ')
  const last = points[points.length - 1]
  const first = points[0]
  const delta = (+last.value - +first.value)

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={i * stepX} cy={y(+p.value)} r="2.5" fill={color} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }} className="muted">
        <span>{first.label}</span>
        <span style={{ color: delta === 0 ? undefined : (delta < 0 ? 'var(--green)' : 'var(--orange-hot)'), fontWeight: 700 }}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}{unit} since {first.label}
        </span>
        <span>{last.label}</span>
      </div>
    </div>
  )
}
