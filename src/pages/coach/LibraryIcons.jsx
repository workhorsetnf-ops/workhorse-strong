// Library: upload a batch of exercise icons at once (Update 176).
// Files are matched to exercises by file name; ChatGPT downloads (which all
// have generic names) can be matched in the order they were saved, against
// the missing-icon list you gave ChatGPT. Every pairing is shown with its
// picture before anything uploads.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { baseKey } from '../../lib/exmatch'
import { matchFiles, matchByOrder, missingIcons, shrinkImage } from '../../lib/iconMatch'

const TAG = { high: ['✓ match', 'var(--green)'], medium: ['✓ match', 'var(--green)'], check: ['check this', '#e5a03a'], order: ['by save order', '#e5a03a'], none: ['pick one', 'var(--red)'] }

export default function LibraryIcons({ library, onDone, onClose }) {
  const [files, setFiles] = useState([])      // [{ file, url }]
  const [matches, setMatches] = useState([])  // [{ libId, conf }]
  const [push, setPush] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [drag, setDrag] = useState(false)

  const byId = useMemo(() => Object.fromEntries(library.map(l => [l.id, l])), [library])
  const sorted = useMemo(() => [...library].sort((a, b) => a.name.localeCompare(b.name)), [library])
  const missing = useMemo(() => missingIcons(library), [library])
  const filesRef = useRef(files); filesRef.current = files
  useEffect(() => () => filesRef.current.forEach(f => URL.revokeObjectURL(f.url)), [])

  function add(list) {
    const imgs = [...list].filter(f => /^image\//.test(f.type))
    if (!imgs.length) return
    const next = [...files, ...imgs.map(file => ({ file, url: URL.createObjectURL(file) }))]
    setFiles(next)
    const keep = matches
    const fresh = matchFiles(next.slice(keep.length).map(f => f.file), library)
    // don't hand a new file an exercise an earlier file already has
    const taken = new Set(keep.map(m => m.libId).filter(Boolean))
    setMatches([...keep, ...fresh.map(m => (m.libId && taken.has(m.libId) ? { libId: null, conf: 'none' } : m))])
  }
  const setMatch = (i, libId) => setMatches(ms => ms.map((m, k) => (k === i ? { libId: libId || null, conf: libId ? 'high' : 'none' } : m.libId && m.libId === libId ? { libId: null, conf: 'none' } : m)))
  const remove = i => { URL.revokeObjectURL(files[i].url); setFiles(f => f.filter((_, k) => k !== i)); setMatches(m => m.filter((_, k) => k !== i)) }

  const unmatched = matches.filter(m => !m.libId).length
  const ready = matches.filter(m => m.libId).length
  const freeMissing = missing.filter(l => !matches.some(m => m.libId === l.id)).length

  const prompt = `Make one exercise icon per image for each exercise below, in this exact order, one at a time. Same style for every icon: [describe your style]. Square, plain background, no text.\n\n${missing.map((l, i) => `${i + 1}. ${l.name}`).join('\n')}`

  async function upload() {
    setErr('')
    const jobs = matches.map((m, i) => ({ ...m, i })).filter(m => m.libId)
    let progIdx = null
    if (push) {
      setBusy('Reading your programs…')
      progIdx = {}
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('program_exercises').select('id, name').range(from, from + 999)
        if (error) { setErr('Could not read programs: ' + error.message); setBusy(''); return }
        for (const r of data || []) (progIdx[baseKey(r.name)] ||= []).push(r.id)
        if (!data || data.length < 1000) break
      }
    }
    let done = 0, placed = 0
    for (const j of jobs) {
      setBusy(`Uploading ${done + 1} of ${jobs.length}…`)
      const lib = byId[j.libId]
      const { blob, ext, type } = await shrinkImage(files[j.i].file)
      const path = `bulk/${Date.now()}-${j.i}-${lib.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.${ext}`
      const { error: ue } = await supabase.storage.from('exercise-icons').upload(path, blob, { contentType: type, upsert: false })
      if (ue) { setErr(`“${lib.name}” failed: ${ue.message}`); break }
      const url = supabase.storage.from('exercise-icons').getPublicUrl(path).data.publicUrl
      const { error: le } = await supabase.from('exercise_library').update({ icon_url: url }).eq('id', lib.id)
      if (le) { setErr(`“${lib.name}” failed: ${le.message}`); break }
      const ids = progIdx?.[baseKey(lib.name)] || []
      for (let k = 0; k < ids.length; k += 200) {
        const { error } = await supabase.from('program_exercises').update({ icon_url: url }).in('id', ids.slice(k, k + 200))
        if (error) { setErr('Could not update programs: ' + error.message); break }
      }
      placed += ids.length; done++
    }
    setBusy('')
    if (done) onDone?.({ done, placed })
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Bulk icons</div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>Drop in a batch of icons. Files named after the exercise match on their own. ChatGPT downloads can be matched in the order you saved them. You check every pairing before anything uploads.</p>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ padding: '5px 10px', fontSize: 12 }}>Close</button>
      </div>

      {missing.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', background: 'var(--coal)', borderRadius: 10, fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 200 }}><strong>{missing.length}</strong> exercises have no icon. Copy the list as a ChatGPT prompt, save the images in that order, then drop them all here.</span>
          <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy ChatGPT prompt'}</button>
        </div>
      )}

      <label onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}
        style={{ border: `2px dashed ${drag ? 'var(--orange)' : 'var(--line)'}`, borderRadius: 12, padding: 18, textAlign: 'center', cursor: 'pointer', fontSize: 13.5 }}>
        <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { add(e.target.files); e.target.value = '' }} aria-label="Choose icon images" />
        <strong>Drop images here</strong> <span className="muted">or tap to choose (pick as many as you like)</span>
      </label>

      {files.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{files.length} image{files.length === 1 ? '' : 's'} · {ready} matched{unmatched ? ` · ${unmatched} to pick` : ''}</span>
            {unmatched > 0 && freeMissing > 0 && (
              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setMatches(m => matchByOrder(files.map(f => f.file), m, missing))}>
                Match the rest by save order</button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 460, overflowY: 'auto' }}>
            {files.map((f, i) => {
              const m = matches[i] || {}
              const lib = m.libId && byId[m.libId]
              const [tag, color] = TAG[m.conf] || TAG.none
              return (
                <div key={f.url} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <img src={f.url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--steel)' }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={m.libId || ''} onChange={e => setMatch(i, e.target.value)} aria-label={`Exercise for ${f.file.name}`} style={{ flex: 1, minWidth: 160, padding: '4px 8px', fontSize: 13 }}>
                        <option value="">— skip this image —</option>
                        {sorted.map(l => <option key={l.id} value={l.id}>{l.name}{l.icon_url ? ' (has icon)' : ''}</option>)}
                      </select>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color }}>{tag}</span>
                      {lib?.icon_url && <img src={lib.icon_url} alt="current" title="Current icon (will be replaced)" style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'cover', opacity: 0.6 }} />}
                    </div>
                  </div>
                  <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => remove(i)} aria-label={`Remove ${f.file.name}`}>✕</button>
                </div>
              )
            })}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={push} onChange={e => setPush(e.target.checked)} />
            Also put each icon on that exercise in every program (so clients see it now)
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" disabled={!ready || !!busy} onClick={upload}>{busy || `Upload ${ready} icon${ready === 1 ? '' : 's'}`}</button>
            {err && <span style={{ color: 'var(--red)', fontSize: 13 }}>{err}</span>}
          </div>
        </>
      )}
    </div>
  )
}
