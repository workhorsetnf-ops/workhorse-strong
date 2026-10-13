import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { MARKERS, CATEGORIES, rangeFor, statusOf, resultsByMarker, fmtRange } from '../../lib/bloodwork'

const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function ClientBloodwork() {
  const { profile } = useAuth()
  const [tests, setTests] = useState([])
  const [results, setResults] = useState([])
  const [ranges, setRanges] = useState({})
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('blood_tests').select('*').eq('client_id', profile.id).order('test_date'),
      supabase.from('blood_results').select('*').eq('client_id', profile.id),
      supabase.from('client_blood_ranges').select('*').eq('client_id', profile.id),
    ]).then(([{ data: t }, { data: r }, { data: rg }]) => {
      setTests(t || []); setResults(r || []); setRanges(Object.fromEntries((rg || []).map(x => [x.marker, x])))
    })
  }, [profile])

  const byMarker = useMemo(() => resultsByMarker(tests, results), [tests, results])
  const rows = MARKERS.filter(m => byMarker[m.name]).map(m => {
    const range = rangeFor(m.name, ranges)
    const latest = byMarker[m.name].latest
    return { ...m, range, latest, status: statusOf(latest.value, range) }
  })
  const flagged = rows.filter(r => r.status === 'HIGH' || r.status === 'LOW')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Health</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Bloodwork</h1>
        {tests.length > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Latest panel: {fmtD(tests[tests.length - 1].test_date)} · {tests.length} test{tests.length > 1 ? 's' : ''} on file</p>}
      </header>

      {rows.length === 0 && <div className="card muted" style={{ fontSize: 14 }}>No bloodwork on file yet. When you get labs done, send them to your coach.</div>}

      {flagged.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--red)', background: 'rgba(214,69,69,0.12)', fontSize: 13.5 }}>
          <strong style={{ color: 'var(--red)' }}>{flagged.length} marker{flagged.length > 1 ? 's' : ''} outside the reference range:</strong> {flagged.map(f => f.name).join(', ')}. Go over these with your doctor.
        </div>
      )}

      {CATEGORIES.map(cat => {
        const list = rows.filter(r => r.category === cat)
        if (!list.length) return null
        return (
          <div className="card" key={cat} style={{ padding: '12px 14px' }}>
            <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{cat}</div>
            {list.map(r => {
              const bad = r.status === 'HIGH' || r.status === 'LOW'
              const history = tests.filter(t => byMarker[r.name].byTest[t.id] !== undefined)
              return (
                <div key={r.name} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                  <button type="button" onClick={() => setOpen(open === r.name ? null : r.name)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: 14 }}>{r.name}</strong>
                      <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>Range {fmtRange(r.range)} {r.unit}</span>
                    </span>
                    <span style={{ fontSize: 17, fontWeight: 800, color: bad ? '#ff4d4d' : 'var(--white)' }}>{r.latest.value}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6, minWidth: 62, textAlign: 'center', background: bad ? '#7a1f1f' : 'rgba(255,90,0,0.14)', color: bad ? '#fff' : 'var(--orange-hot)' }}>{r.status}</span>
                  </button>
                  {open === r.name && history.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {history.slice().reverse().map(t => {
                        const v = byMarker[r.name].byTest[t.id]
                        const st = statusOf(v, r.range)
                        return (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                            <span className="muted">{fmtD(t.test_date)}</span>
                            <span style={{ fontWeight: 700, color: st === 'HIGH' || st === 'LOW' ? '#ff4d4d' : 'var(--white)' }}>{v} {r.unit}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {rows.length > 0 && <p className="muted" style={{ fontSize: 11.5 }}>Tap a marker to see every test. This is for tracking your progress, not a diagnosis — your doctor interprets your labs.</p>}
    </div>
  )
}
