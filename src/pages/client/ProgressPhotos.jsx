import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { photoRows } from '../../lib/measurements'

const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
const ANGLES = ['Front', 'Side', 'Back']
const TIPS = [
  'Same time: morning, after the bathroom, before food', 'Same spot, same lighting, same clothes',
  'Phone at chest height, about 6 ft away (or use a timer)', 'Front, side and back, relaxed. Add flexed shots if wanted',
  'Every 2 weeks, on check-in day', 'No pump, no filters, no wide-angle lens',
]

function Section({ title, right, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8 }}>
        <span style={{ color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>{title}</span>{right}
      </div>
      {children}
    </div>
  )
}

function Photo({ url, label, tall }) {
  const box = { width: '100%', aspectRatio: tall ? '3 / 4' : '3 / 4', borderRadius: 8, overflow: 'hidden', background: '#141414', border: url ? '1px solid var(--line)' : '1.5px dashed var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  if (!url) return <div style={box}><span style={{ color: '#5a5a5a', fontWeight: 800, fontSize: 11 }}>+ {label.toUpperCase()}</span></div>
  return (
    <a href={url} target="_blank" rel="noreferrer" style={box} aria-label={`Open ${label} photo`}>
      <img src={url} alt={label} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </a>
  )
}

// The sheet's Progress Photos tab, built from check-in photos.
export default function ProgressPhotos({ clientId, isCoach }) {
  const [rows, setRows] = useState(null)
  const [urls, setUrls] = useState({})
  const [cmp, setCmp] = useState({ a: '', b: '' })
  const [notes, setNotes] = useState({})

  useEffect(() => {
    if (!clientId) return
    Promise.all([
      supabase.from('checkins').select('*').eq('client_id', clientId).order('submitted_at'),
      supabase.from('profiles').select('start_date').eq('id', clientId).single(),
    ]).then(async ([{ data: cks }, { data: p }]) => {
      const list = photoRows(cks || [], p?.start_date || null, localDateStr)
      setRows(list)
      if (list.length >= 2) setCmp({ a: list[0].id, b: list[list.length - 1].id })
      const paths = [...new Set(list.flatMap(r => [r.Front, r.Side, r.Back, ...r.others].filter(Boolean)))]
      const map = {}
      for (const path of paths) {
        const { data } = await supabase.storage.from('checkin-photos').createSignedUrl(path, 3600)
        if (data?.signedUrl) map[path] = data.signedUrl
      }
      setUrls(map)
    })
  }, [clientId])

  async function saveNote(r, text) {
    if (text === r.note) return
    setRows(list => list.map(x => (x.id === r.id ? { ...x, note: text } : x)))
    await supabase.from('checkins').update({ photo_note: text }).eq('id', r.id)
  }

  if (!rows) return <p className="muted">Loading…</p>
  const A = rows.find(r => r.id === cmp.a), B = rows.find(r => r.id === cmp.b)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Section title="Photo day checklist">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', borderRadius: 8, overflow: 'hidden' }}>
          {TIPS.map((t, i) => <div key={i} style={{ padding: '8px 10px', fontSize: 12.5, background: Math.floor(i / 2) % 2 ? 'var(--steel)' : 'var(--coal)' }}><span style={{ color: 'var(--orange-hot)', fontWeight: 900 }}>✓</span>  {t}</div>)}
        </div>
      </Section>

      {rows.length >= 2 && (
        <Section title="Compare">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['a', 'b'].map(k => (
                <select key={k} value={cmp[k]} onChange={e => setCmp({ ...cmp, [k]: e.target.value })} aria-label={k === 'a' ? 'Compare from' : 'Compare to'}>
                  {rows.map(r => <option key={r.id} value={r.id}>{r.week !== null ? `Wk ${r.week} · ` : ''}{fmtD(r.date)}{r.weight ? ` · ${r.weight} lb` : ''}</option>)}
                </select>
              ))}
            </div>
            {ANGLES.map(ang => (
              <div key={ang}>
                <div className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', marginBottom: 4 }}>{ang.toUpperCase()}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Photo url={urls[A?.[ang]]} label={ang} /><Photo url={urls[B?.[ang]]} label={ang} />
                </div>
              </div>
            ))}
            {A?.weight && B?.weight && <div style={{ textAlign: 'center', fontWeight: 900, color: 'var(--orange-hot)' }}>{(B.weight - A.weight > 0 ? '+' : '') + (B.weight - A.weight).toFixed(1)} lb between these photos</div>}
          </div>
        </Section>
      )}

      <Section title="Check-in photos" right={!isCoach && <Link to="/app/checkin" style={{ fontSize: 12 }}>Add with your check-in →</Link>}>
        {rows.length === 0 && <div className="card muted" style={{ fontSize: 13.5 }}>No photos yet. {isCoach ? 'They upload them with their check-in.' : 'Add front, side and back photos when you submit your check-in.'}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...rows].reverse().map(r => (
            <div key={r.id} className="card" style={{ padding: 10, borderTop: '3px solid var(--orange)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: "'Anton','Barlow Condensed',system-ui,sans-serif", fontSize: 22, color: 'var(--orange-hot)' }}>{r.week !== null ? `WK ${r.week}` : ''}</span>
                <strong style={{ fontSize: 14 }}>{fmtD(r.date)}</strong>
                {r.weight && <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{r.weight} lb</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {ANGLES.map(a => <Photo key={a} url={urls[r[a]]} label={a} />)}
              </div>
              {r.others.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{r.others.map(p => urls[p] && <a key={p} href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" style={{ width: 54, height: 72, objectFit: 'cover', borderRadius: 6 }} /></a>)}</div>
              )}
              <input defaultValue={r.note} placeholder="Notes (e.g. waist tighter from the side)" aria-label={`Notes ${r.date}`}
                onBlur={e => saveNote(r, e.target.value.trim())} style={{ marginTop: 8, fontSize: 12.5, fontStyle: 'italic' }} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
