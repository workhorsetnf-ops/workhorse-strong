import { itemMacros, sumMacros, planStatus, fmt0, fmt1 } from '../../lib/mealplan'

const ANTON = "'Anton','Barlow Condensed',system-ui,sans-serif"

export function StatusBadge({ status, small }) {
  if (!status) return null
  const on = status === 'ON TARGET'
  return (
    <span style={{ display: 'inline-block', fontSize: small ? 9.5 : 10.5, fontWeight: 800, letterSpacing: '.06em', padding: small ? '2px 6px' : '3px 9px', borderRadius: 5,
      background: on ? 'var(--orange)' : '#b3261e', color: on ? '#000' : '#fff', whiteSpace: 'nowrap' }}>{status}</span>
  )
}

// The five target tiles across the top of the sheet's Meal Plan tab.
export function PlanTargets({ targets, totals, compact }) {
  const st = planStatus(totals, targets)
  const tiles = [
    ['Calories', targets.kcal, totals.kcal, 'kcal', st.kcal, true],
    ['Protein', targets.p, totals.p, 'g', st.p],
    ['Carbs', targets.c, totals.c, 'g', st.c],
    ['Fat', targets.f, totals.f, 'g', st.f],
    ['Fiber', targets.fi, totals.fi, 'g', st.fi],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(5, minmax(0, 1fr))', gap: compact ? 8 : 10 }}>
      {tiles.map(([label, tgt, planned, unit, status, accent], i) => (
        <div key={label} style={{ gridColumn: compact && i === 0 ? '1 / -1' : undefined, background: 'var(--coal)', border: '1px solid var(--line)', borderTop: '3px solid var(--orange)', borderRadius: 10, padding: compact ? '8px 8px' : '10px 10px', textAlign: 'center', minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Target {label}</div>
          <div style={{ fontFamily: ANTON, fontSize: compact ? 24 : 30, lineHeight: 1.15, marginTop: 2, color: accent ? 'var(--orange-hot)' : 'var(--white)' }}>
            {tgt ? `${fmt0(tgt)}${unit === 'g' ? ' g' : ''}` : '—'}
          </div>
          <div className="muted" style={{ fontSize: 11, margin: '2px 0 5px' }}>Planned: {fmt0(planned)} {unit}</div>
          <StatusBadge status={status} small={compact} />
        </div>
      ))}
    </div>
  )
}

// Read-only plan as phone cards (client view).
export function PlanCards({ meals, items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {meals.map((m, i) => {
        const list = items.filter(it => it.meal_id === m.id).sort((a, b) => a.position - b.position)
        const t = sumMacros(list)
        return (
          <div key={m.id} className="card" style={{ padding: 0, overflow: 'hidden', borderTop: '3px solid var(--orange)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--steel)' }}>
              <span style={{ fontFamily: ANTON, fontSize: 28, lineHeight: 1, color: 'var(--orange-hot)', width: 24, textAlign: 'center' }}>{i + 1}</span>
              <strong style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: '.04em', flex: 1 }}>{m.label}</strong>
              <span style={{ fontWeight: 800, color: 'var(--orange-hot)', fontSize: 14 }}>{fmt0(t.kcal)} kcal</span>
            </div>
            {list.map(it => {
              const x = itemMacros(it)
              return (
                <div key={it.id} style={{ padding: '8px 12px', borderTop: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{it.food_name}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt1(it.grams)} g</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                    <span style={{ color: 'var(--orange-hot)', fontWeight: 700 }}>{fmt0(x.kcal)} kcal</span> · P {fmt1(x.p)} · C {fmt1(x.c)} · F {fmt1(x.f)} · Fiber {fmt1(x.fi)}
                  </div>
                  {it.note && <div className="muted" style={{ fontSize: 11.5, fontStyle: 'italic', marginTop: 2 }}>{it.note}</div>}
                </div>
              )
            })}
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--orange)', background: 'var(--steel)', fontSize: 12 }}>
              <strong style={{ color: 'var(--orange-hot)', letterSpacing: '.04em' }}>{m.label.toUpperCase()} TOTAL</strong>
              <span style={{ marginLeft: 8, fontWeight: 700 }}>P {fmt0(t.p)} · C {fmt0(t.c)} · F {fmt0(t.f)} · Fiber {fmt0(t.fi)}</span>
              {m.swap && <div className="muted" style={{ fontStyle: 'italic', marginTop: 4, lineHeight: 1.4 }}>{m.swap}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DailyTotalBar({ totals }) {
  const cells = [['Calories', fmt0(totals.kcal)], ['Protein', `${fmt0(totals.p)} g`], ['Carbs', `${fmt0(totals.c)} g`], ['Fat', `${fmt0(totals.f)} g`], ['Fiber', `${fmt0(totals.fi)} g`]]
  return (
    <div style={{ background: 'var(--orange)', color: '#000', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: '.08em', marginBottom: 4 }}>DAILY TOTAL</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 4, textAlign: 'center' }}>
        {cells.map(([l, v]) => (
          <div key={l} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap' }}>{v}</div>
            <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', opacity: 0.75 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// The sheet's Shopping List table. onToggle(key) makes the boxes tappable.
export function ShoppingTable({ rows, checked, onToggle, compact }) {
  const th = { fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '7px 6px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: compact ? '7px 5px' : '7px 8px', borderTop: '1px solid var(--line)', fontSize: 13, textAlign: 'center', verticalAlign: 'middle' }
  const set = new Set(checked)
  let lastCat = null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {!compact && <th style={th}>#</th>}
            <th style={{ ...th, textAlign: 'left', paddingLeft: 10 }}>Item</th>
            {!compact && <th style={th}>Per day</th>}
            <th style={th}>Total</th><th style={th}>lb</th><th style={th}>Got it</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const got = set.has(r.key)
            const head = r.category !== lastCat
            lastCat = r.category
            return [
              head && (
                <tr key={'c' + r.category}><td colSpan={compact ? 4 : 6} style={{ ...td, textAlign: 'left', background: 'var(--steel)', color: 'var(--orange-hot)', fontWeight: 800, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', padding: '6px 10px' }}>{r.category}</td></tr>
              ),
              <tr key={r.key} style={{ color: got ? 'var(--muted)' : undefined }}>
                {!compact && <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 800 }}>{i + 1}</td>}
                <td style={{ ...td, textAlign: 'left', paddingLeft: 10, fontWeight: 700, textDecoration: got ? 'line-through' : 'none' }}>{r.name}</td>
                {!compact && <td style={td}>{r.perDay} g</td>}
                <td style={{ ...td, color: got ? undefined : 'var(--orange-hot)', fontWeight: 800, whiteSpace: 'nowrap', textDecoration: got ? 'line-through' : 'none' }}>{r.total.toLocaleString()} g</td>
                <td style={{ ...td, fontWeight: 700, textDecoration: got ? 'line-through' : 'none' }}>{r.lb}</td>
                <td style={td}>
                  {onToggle
                    ? <button type="button" aria-label={`Got ${r.name}`} aria-pressed={got} onClick={() => onToggle(r.key)}
                        style={{ width: 28, height: 28, padding: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 900, color: '#000', background: got ? 'var(--orange)' : 'transparent', border: '1.5px solid ' + (got ? 'var(--orange)' : 'var(--line)') }}>{got ? '✓' : ''}</button>
                    : <span style={{ fontWeight: 900, color: 'var(--orange-hot)' }}>{got ? '✓' : ''}</span>}
                </td>
              </tr>,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
