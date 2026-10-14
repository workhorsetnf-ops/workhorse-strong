import { localDateStr } from '../../lib/weeks'
import { typeOf, phaseWeeks, statusOf, caloriesOf, summary, timeline, countdown, eventWeek } from '../../lib/phases'

const fmt = (d, year) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: '2-digit' } : {}) })

function Tile({ label, value, sub, accent, compact }) {
  return (
    <div style={{ background: 'var(--coal)', border: '1px solid var(--line)', borderTop: '3px solid var(--orange)', borderRadius: 10, padding: '10px 10px', textAlign: 'center', minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: compact ? 20 : 24, lineHeight: 1.15, marginTop: 4, color: accent ? 'var(--orange-hot)' : 'var(--white)', fontFamily: "'Oswald','Barlow',system-ui,sans-serif", textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function PlannerTiles({ phases, compact }) {
  const s = summary(phases)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
      <Tile label="Current phase" compact={compact} accent value={s.current ? typeOf(s.current.phase_type).label : '—'} sub={s.current ? (caloriesOf(s.current) ? `${caloriesOf(s.current).toLocaleString()} kcal` : s.current.name) : 'Between phases'} />
      <Tile label="Week of phase" compact={compact} value={s.current ? (compact ? `${s.week} of ${s.weeks}` : `Week ${s.week} of ${s.weeks}`) : '—'} sub={s.current ? `Ends ${fmt(s.current.end_date)}` : ''} />
      <Tile label="Days left" compact={compact} value={s.current ? s.daysLeft : '—'} sub={s.current ? 'in this phase' : ''} />
      <Tile label="Next phase" compact={compact} value={s.next ? typeOf(s.next.phase_type).label : '—'} sub={s.next ? `Starts ${fmt(s.next.start_date)}` : 'Nothing after this yet'} />
    </div>
  )
}

// Big countdown to the client's event (TV taping, show, shoot). Hidden once it's passed.
export function EventBanner({ name, date, compact }) {
  const c = countdown(date)
  if (!c) return null
  const when = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 12 : 18, background: 'var(--orange)', color: '#000', borderRadius: 12, padding: compact ? '10px 14px' : '12px 18px' }}>
      <div style={{ fontFamily: "'Oswald','Barlow',system-ui,sans-serif", fontWeight: 700, fontSize: compact ? 40 : 48, lineHeight: 1 }}>{c.days}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em' }}>{c.days === 0 ? 'TODAY' : c.days === 1 ? 'DAY TO GO' : 'DAYS TO GO'}</div>
        <div style={{ fontFamily: "'Oswald','Barlow',system-ui,sans-serif", fontWeight: 700, fontSize: compact ? 18 : 22, textTransform: 'uppercase', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Event day'}</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{when}{c.days >= 7 ? ` · ${c.weeks} wk${c.weeks === 1 ? '' : 's'}${c.rem ? ` ${c.rem} d` : ''}` : ''}</div>
      </div>
    </div>
  )
}

export function PlannerTimeline({ phases, eventDate, eventName }) {
  const t = timeline(phases)
  const ew = eventWeek(phases, eventDate)
  if (!t.rows.length) return null
  const cell = 100 / t.totalWeeks
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {t.rows.map(({ phase, offset, length }, i) => {
        const ty = typeOf(phase.phase_type)
        const cur = statusOf(phase) === 'CURRENT'
        return (
          <div key={phase.id || i} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 130px) 1fr', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: cur ? 'var(--orange-hot)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {ty.label}</span>
            <div style={{ position: 'relative', height: 20, background: 'var(--steel)', borderRadius: 4, overflow: 'hidden' }}>
              <div title={`${phase.name}: ${fmt(phase.start_date)} – ${fmt(phase.end_date, true)}`}
                style={{ position: 'absolute', left: `${offset * cell}%`, width: `${length * cell}%`, top: 0, bottom: 0, background: ty.color, opacity: statusOf(phase) === 'COMPLETE' ? 0.45 : 1,
                  borderRadius: 3, display: 'flex', alignItems: 'center', paddingLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {length}w
              </div>
              {t.todayWeek !== null && (
                <div style={{ position: 'absolute', left: `calc(${(t.todayWeek + 0.5) * cell}% - 1px)`, top: -2, bottom: -2, width: 2, background: 'var(--white)' }} />
              )}
              {ew !== null && ew <= t.totalWeeks && (
                <div title={eventName || 'Event'} style={{ position: 'absolute', left: `calc(${ew * cell}% - 1px)`, top: -2, bottom: -2, width: 0, borderLeft: '3px dashed #fff', filter: 'drop-shadow(0 0 2px #000)' }} />
              )}
            </div>
          </div>
        )
      })}
      <div className="muted" style={{ fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: '2px 12px', justifyContent: 'space-between' }}>
        <span style={{ whiteSpace: 'nowrap' }}>{fmt(t.rows[0].phase.start_date, true)}</span>
        {t.todayWeek !== null && <span style={{ whiteSpace: 'nowrap' }}>▏white line = this week</span>}
        {ew !== null && <span style={{ whiteSpace: 'nowrap', color: 'var(--orange-hot)', fontWeight: 800 }}>┊ dashed = {eventName || 'event'}</span>}
        <span style={{ whiteSpace: 'nowrap' }}>{t.totalWeeks} weeks · ends {fmt(summary(phases).planEnd, true)}</span>
      </div>
    </div>
  )
}

const STATUS_STYLE = {
  CURRENT: { background: 'var(--orange)', color: '#000' },
  COMPLETE: { background: 'transparent', color: 'var(--muted)', fontStyle: 'italic' },
  UPCOMING: { background: 'transparent', color: 'var(--white)' },
}

export function PlannerTable({ phases, onEdit, onDelete }) {
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '8px 6px', borderTop: '1px solid var(--line)', fontSize: 13, textAlign: 'center', verticalAlign: 'middle' }
  const sorted = [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const today = localDateStr()
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
        <thead>
          <tr>{['#', 'Phase', 'Start', 'Weeks', 'End', 'Calories', 'Protein', 'Carbs', 'Fat', 'Goal / focus', 'Status', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: ['Phase', 'Goal / focus'].includes(h) ? 'left' : 'center' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const st = statusOf(p, today)
            const ty = typeOf(p.phase_type)
            const cur = st === 'CURRENT'
            return (
              <tr key={p.id} style={{ background: i % 2 ? 'var(--steel)' : 'transparent' }}>
                <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 800, fontSize: 15 }}>{i + 1}</td>
                <td style={{ ...td, textAlign: 'left' }}>
                  <strong style={{ color: cur ? 'var(--orange-hot)' : ty.color }}>{ty.label}</strong>
                  {p.name && p.name !== ty.label && <div className="muted" style={{ fontSize: 11.5 }}>{p.name}</div>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(p.start_date, true)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{phaseWeeks(p)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(p.end_date, true)}</td>
                <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 800 }}>{caloriesOf(p) ? caloriesOf(p).toLocaleString() : '—'}</td>
                <td style={td}>{p.protein_g ? `${p.protein_g} g` : '—'}</td>
                <td style={td}>{p.carbs_g ? `${p.carbs_g} g` : '—'}</td>
                <td style={td}>{p.fat_g ? `${p.fat_g} g` : '—'}</td>
                <td style={{ ...td, textAlign: 'left', color: 'var(--muted)', fontSize: 12, maxWidth: 260 }}>{p.notes}</td>
                <td style={td}><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '4px 8px', borderRadius: 6, ...STATUS_STYLE[st] }}>{st}</span></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {onEdit && <button className="btn-ghost" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => onEdit(p)}>Edit</button>}
                  {onDelete && <button className="btn-ghost" style={{ padding: '4px 9px', fontSize: 12, color: 'var(--red)', marginLeft: 4 }} onClick={() => onDelete(p.id)}>✕</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
