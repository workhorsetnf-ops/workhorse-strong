// Library: find demo videos on YouTube instead of hunting and copying links
// (Update 163). Steps through exercises one at a time: top short demos with
// thumbnails, tap "Use this" and it's saved, then the next exercise loads.
// Optionally also fills the same exercise in programs that have no video yet.
import { useEffect, useRef, useState } from 'react'
import { Search, ExternalLink, Check, SkipForward, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callApi } from '../../lib/push'
import { normName } from '../../lib/exmatch'

export const fmtSecs = s => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`)

// Program exercises with the same name (ignoring caps/spacing/punctuation) and no video yet.
export function programTargets(name, rows) {
  const k = normName(name)
  return rows.filter(r => normName(r.name) === k && !String(r.video_url || '').trim()).map(r => r.id)
}

export default function VideoFinder({ queue, onSaved, onClose }) {
  const [i, setI] = useState(0)
  const [query, setQuery] = useState(queue[0]?.name || '')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [alsoPrograms, setAlsoPrograms] = useState(true)
  const [progRows, setProgRows] = useState(null)
  const [saved, setSaved] = useState(0)
  const seq = useRef(0)
  const item = queue[i]

  // program exercises without a video, loaded once
  useEffect(() => {
    ;(async () => {
      const rows = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('program_exercises').select('id, name, video_url').range(from, from + 999)
        if (error) { setProgRows([]); return }
        rows.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      setProgRows(rows)
    })()
  }, [])

  async function search(q) {
    const my = ++seq.current
    setBusy('search'); setErr(''); setResults(null)
    try {
      const out = await callApi('/api/video-search', { q })
      if (my === seq.current) setResults(out.results || [])
    } catch (e) { if (my === seq.current) setErr(e.message) }
    if (my === seq.current) setBusy('')
  }
  useEffect(() => { if (item) { setQuery(item.name); search(item.name) } }, [i])

  function next(count = saved) {
    if (i + 1 >= queue.length) return onClose(count)
    setI(i + 1)
  }

  async function use(v) {
    setBusy(v.id); setErr('')
    const { error } = await supabase.from('exercise_library').update({ video_url: v.url }).eq('id', item.id)
    if (error) { setBusy(''); return setErr('Could not save: ' + error.message) }
    let n = 0
    if (alsoPrograms && progRows) {
      const ids = programTargets(item.name, progRows)
      for (let k = 0; k < ids.length; k += 200) {
        const { error: e2 } = await supabase.from('program_exercises').update({ video_url: v.url }).in('id', ids.slice(k, k + 200))
        if (e2) { setBusy(''); return setErr('Saved to the library, but programs failed: ' + e2.message) }
        n += Math.min(200, ids.length - k)
      }
      const done = new Set(ids)
      setProgRows(rows => rows.map(r => (done.has(r.id) ? { ...r, video_url: v.url } : r)))
    }
    const count = saved + 1
    setSaved(count)
    onSaved?.(item.id, v.url, n)
    setBusy('')
    next(count)
  }

  if (!item) return null
  const progCount = progRows ? programTargets(item.name, progRows).length : null

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Find videos{queue.length > 1 ? ` · ${i + 1} of ${queue.length}` : ''}{saved ? ` · ${saved} saved` : ''}</div>
          <strong style={{ fontSize: 18 }}>{item.name}</strong>
        </div>
        <button className="btn-ghost" onClick={() => onClose(saved)} style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> Done</button>
      </div>

      <form onSubmit={e => { e.preventDefault(); if (query.trim()) search(query.trim()) }} style={{ display: 'flex', gap: 8 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search YouTube" style={{ flex: 1 }} />
        <button className="btn-ghost" type="submit" disabled={busy === 'search'} style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><Search size={14} /> Search</button>
      </form>

      {busy === 'search' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Searching YouTube…</p>}
      {err && <p style={{ margin: 0, fontSize: 13, color: 'var(--red)' }}>{err}</p>}
      {results && results.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No short demos found. Try different words, e.g. add the equipment.</p>}

      {results && results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {results.map(v => (
            <div key={v.id} style={{ background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <a href={v.url} target="_blank" rel="noreferrer" title="Watch on YouTube" style={{ position: 'relative', display: 'block' }}>
                <img src={v.thumb} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }} />
                <span style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: v.seconds < 60 ? 'var(--green)' : 'rgba(0,0,0,.8)', color: v.seconds < 60 ? '#000' : '#fff' }}>{fmtSecs(v.seconds)}</span>
                <span style={{ position: 'absolute', left: 6, top: 6, background: 'rgba(0,0,0,.7)', borderRadius: 4, padding: 3, display: 'flex' }}><ExternalLink size={12} color="#fff" /></span>
              </a>
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.title}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{v.channel}</div>
                <button className="btn" disabled={!!busy} onClick={() => use(v)} style={{ marginTop: 'auto', padding: '7px 10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Check size={14} /> {busy === v.id ? 'Saving…' : 'Use this'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={alsoPrograms} onChange={e => setAlsoPrograms(e.target.checked)} />
          Also add to programs{progCount === null ? '' : ` (${progCount} without a video)`}
        </label>
        {queue.length > 1 && (
          <button className="btn-ghost" disabled={!!busy && busy !== 'search'} onClick={() => next()} style={{ padding: '6px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}>
            <SkipForward size={14} /> {i + 1 >= queue.length ? 'Finish' : 'Skip'}
          </button>
        )}
      </div>
    </div>
  )
}
