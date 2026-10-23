import { kcalOf, byMeal } from '../../lib/foodlog'

const DOW = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const dow = d => DOW[new Date(d + 'T00:00:00').getDay()]
const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const r0 = n => Math.round(n).toLocaleString()

function Badge({ status }) {
  if (!status) return null
  const on = status === 'ON TARGET'
  return <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.05em', padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap', background: on ? 'var(--orange)' : '#b3261e', color: on ? '#000' : '#fff' }}>{status}</span>
}

// The sheet's DAILY TOTALS block for one week.
export function WeekTotals({ table, targets, today, selected, onPick, compact }) {
  const th = { fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: '#000', background: 'var(--orange)', padding: '7px 4px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: compact ? '7px 3px' : '7px 6px', borderTop: '1px solid var(--line)', fontSize: compact ? 12.5 : 13, textAlign: 'center' }
  const foot = { ...td, background: 'var(--steel)', fontWeight: 900 }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left', paddingLeft: 8 }}>Day</th>
          {!compact && <th style={th}>Items</th>}
          <th style={th}>Cal</th><th style={th}>P</th><th style={th}>C</th><th style={th}>F</th>{!compact && <th style={th}>Fiber</th>}<th style={th}>Status</th>
        </tr></thead>
        <tbody>
          {table.rows.map((r, i) => {
            const isToday = r.date === today, sel = r.date === selected
            return (
              <tr key={r.date} onClick={onPick ? () => onPick(r.date) : undefined}
                style={{ background: sel ? 'rgba(255,106,0,0.16)' : i % 2 ? 'var(--steel)' : 'var(--coal)', cursor: onPick ? 'pointer' : undefined }}>
                <td style={{ ...td, textAlign: 'left', paddingLeft: 8, fontWeight: 800, color: isToday ? 'var(--orange-hot)' : undefined, whiteSpace: 'nowrap' }}>
                  {compact ? dow(r.date).slice(0, 3) : dow(r.date)} <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>{md(r.date)}</span>
                </td>
                {!compact && <td style={{ ...td, color: 'var(--muted)' }}>{r.items || ''}</td>}
                <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 800 }}>{r.items ? r0(r.kcal) : ''}</td>
                <td style={td}>{r.items ? r0(r.p) : ''}</td><td style={td}>{r.items ? r0(r.c) : ''}</td><td style={td}>{r.items ? r0(r.f) : ''}</td>
                {!compact && <td style={td}>{r.items && r.fi ? r0(r.fi) : ''}</td>}
                <td style={td}><Badge status={r.status} /></td>
              </tr>
            )
          })}
          <tr>
            <td style={{ ...foot, textAlign: 'left', paddingLeft: 8, color: 'var(--muted)', borderTop: '1px solid var(--orange)' }}>TARGET</td>
            {!compact && <td style={{ ...foot, borderTop: '1px solid var(--orange)' }} />}
            {[targets.kcal, targets.p, targets.c, targets.f].map((v, i) => <td key={i} style={{ ...foot, color: 'var(--muted)', borderTop: '1px solid var(--orange)' }}>{v ? r0(v) : '—'}</td>)}
            {!compact && <td style={{ ...foot, color: 'var(--muted)', borderTop: '1px solid var(--orange)' }}>{targets.fi ? r0(targets.fi) : '—'}</td>}
            <td style={{ ...foot, borderTop: '1px solid var(--orange)' }} />
          </tr>
          <tr>
            <td style={{ ...foot, textAlign: 'left', paddingLeft: 8, color: 'var(--orange-hot)', fontSize: 11 }}>{compact ? 'AVG' : 'WEEK AVERAGE (LOGGED DAYS)'}</td>
            {!compact && <td style={foot} />}
            {['kcal', 'p', 'c', 'f'].map(k => <td key={k} style={{ ...foot, color: 'var(--orange-hot)' }}>{table.average ? r0(table.average[k]) : ''}</td>)}
            {!compact && <td style={{ ...foot, color: 'var(--orange-hot)' }}>{table.average && table.average.fi ? r0(table.average.fi) : ''}</td>}
            <td style={{ ...foot, fontSize: 11, whiteSpace: 'nowrap' }}>{table.onTarget} / {table.loggedDays}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// One day's food log, grouped by meal like the sheet.
export function DayLog({ logs, onRemove }) {
  if (!logs.length) return <p className="muted" style={{ fontSize: 13, padding: '6px 2px' }}>Nothing logged.</p>
  const td = { padding: '7px 5px', borderTop: '1px solid var(--line)', fontSize: 12.5, textAlign: 'center' }
  const hd = { ...td, whiteSpace: 'nowrap', fontSize: 11.5 }
  const hasTotals = logs.some(l => l.meal === 'Daily totals')
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden' }}>
      {hasTotals && logs.some(l => l.meal !== 'Daily totals') && (
        <p className="muted" style={{ fontSize: 11.5, margin: '0 2px 6px' }}>They logged daily totals for this day, so those count as the day. The meals below are shown for reference and aren't added on top.</p>
      )}
      {byMeal(logs).map(({ meal, items }) => {
        const t = items.reduce((a, l) => ({ k: a.k + kcalOf(l), p: a.p + (+l.protein_g || 0), c: a.c + (+l.carbs_g || 0), f: a.f + (+l.fat_g || 0) }), { k: 0, p: 0, c: 0, f: 0 })
        return (
          <table key={meal || '-'} style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 6, opacity: hasTotals && meal !== 'Daily totals' ? 0.55 : 1 }}>
            <thead><tr style={{ background: 'var(--steel)' }}>
              <th style={{ ...td, textAlign: 'left', color: 'var(--orange-hot)', fontWeight: 900, letterSpacing: '.06em', fontSize: 11.5, borderTop: '2px solid var(--orange)' }}>{(meal || 'Logged').toUpperCase()}</th>
              <th style={{ ...td, color: 'var(--orange-hot)', fontWeight: 900, borderTop: '2px solid var(--orange)' }}>{r0(t.k)}</th>
              <th style={{ ...hd, fontWeight: 800, borderTop: '2px solid var(--orange)' }}>P {r0(t.p)}</th>
              <th style={{ ...hd, fontWeight: 800, borderTop: '2px solid var(--orange)' }}>C {r0(t.c)}</th>
              <th style={{ ...hd, fontWeight: 800, borderTop: '2px solid var(--orange)' }}>F {r0(t.f)}</th>
              {onRemove && <th style={{ ...td, borderTop: '2px solid var(--orange)' }} />}
            </tr></thead>
            <tbody>
              {items.map((l, i) => (
                <tr key={l.id} style={{ background: i % 2 ? 'var(--steel)' : 'var(--coal)' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{l.meal_name}</td>
                  <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 800 }}>{r0(kcalOf(l))}</td>
                  <td style={td}>{l.protein_g}</td><td style={td}>{l.carbs_g}</td><td style={td}>{l.fat_g}</td>
                  {onRemove && <td style={{ ...td, width: 28 }}><button aria-label={`Remove ${l.meal_name}`} onClick={() => onRemove(l.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>✕</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )
      })}
    </div>
  )
}
