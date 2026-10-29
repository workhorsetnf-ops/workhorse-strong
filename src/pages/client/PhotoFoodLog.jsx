// Snap a photo of a meal → AI lists the foods with estimated grams → client
// adjusts amounts → logged as "📷 Estimated" entries.
import { useRef, useState } from 'react'
import { Camera, X, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callApi } from '../../lib/push'
import { localDateStr } from '../../lib/weeks'
import { itemTotals, mealTotals, photoRows } from '../../lib/photoFood'

// Shrink to max 1024px JPEG so uploads are small and fast.
export async function shrinkImage(file, max = 1024, quality = 0.82) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', quality)
  } finally { URL.revokeObjectURL(url) }
}

export default function PhotoFoodLog({ profile, slot, onLogged }) {
  const [open, setOpen] = useState(false)
  const [img, setImg] = useState(null)        // data URL
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [res, setRes] = useState(null)        // { items, confidence, warning, left }
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  function reset() { setImg(null); setNote(''); setRes(null); setErr(''); setBusy('') }
  function close() { reset(); setOpen(false) }

  async function pick(file) {
    if (!file) return
    setErr(''); setRes(null)
    try { setImg(await shrinkImage(file)) } catch { setErr('Couldn’t open that photo. Try another one.') }
  }

  async function estimate() {
    setBusy('ai'); setErr('')
    try { setRes(await callApi('/api/food-photo', { image: img, note })) }
    catch (e) { setErr(e.message) }
    setBusy('')
  }

  const setItem = (i, patch) => setRes(r => ({ ...r, items: r.items.map((x, j) => j === i ? { ...x, ...patch } : x) }))
  const dropItem = i => setRes(r => ({ ...r, items: r.items.filter((_, j) => j !== i) }))

  async function log() {
    const rows = photoRows(res.items, { clientId: profile.id, date: localDateStr(), slot })
    if (!rows.length) return
    setBusy('log')
    let { error } = await supabase.from('meal_logs').insert(rows)
    if (error && /source|estimated/.test(error.message)) {
      // before Update 150's SQL is run: log without the new columns
      ;({ error } = await supabase.from('meal_logs').insert(rows.map(({ source, estimated, ...r }) => r)))
    }
    setBusy('')
    if (error) { setErr('Could not log it: ' + error.message); return }
    close(); onLogged?.()
  }

  if (!open) {
    return <button className="btn-ghost" onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Camera size={16} /> Snap a meal (AI estimate)</button>
  }

  const tot = res ? mealTotals(res.items) : null
  return (
    <div style={{ border: '1px solid var(--orange)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 15 }}>📷 Snap a meal</strong>
        <button onClick={close} aria-label="Close" style={{ background: 'none', color: 'var(--muted)' }}><X size={18} /></button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
      {!img ? (
        <button className="btn" onClick={() => fileRef.current?.click()} style={{ padding: '14px 10px' }}>Take or choose a photo</button>
      ) : (
        <div style={{ position: 'relative' }}>
          <img src={img} alt="Your meal" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 10 }} />
          {!res && <button className="btn-ghost" onClick={() => fileRef.current?.click()} style={{ position: 'absolute', right: 8, bottom: 8, padding: '5px 10px', fontSize: 12, background: 'rgba(0,0,0,.6)' }}>Change</button>}
        </div>
      )}

      {img && !res && (
        <>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional but makes it much more accurate: “8 oz chicken, 1 cup rice, cooked in olive oil”" />
          <button className="btn" onClick={estimate} disabled={!!busy}>{busy === 'ai' ? 'Looking at your meal…' : 'Estimate macros'}</button>
        </>
      )}

      {res && (
        <>
          {res.warning && <p style={{ fontSize: 13, color: 'var(--orange-hot)', margin: 0 }}>{res.warning}</p>}
          {res.items.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Couldn’t find food in that photo. Try another angle, or search instead.</p>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 12.5 }}>Check the amounts. Change the grams if they look off and the macros update.</div>
              {res.items.map((it, i) => {
                const t = itemTotals(it)
                return (
                  <div key={i} style={{ background: 'var(--steel)', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={it.name} onChange={e => setItem(i, { name: e.target.value })} style={{ flex: 1, fontWeight: 700 }} aria-label="Food" />
                      <button onClick={() => dropItem(i)} aria-label="Remove" style={{ background: 'none', color: 'var(--muted)' }}><Trash2 size={15} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                      <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setItem(i, { grams: Math.max(5, Math.round(it.grams * 0.8)) })}>−</button>
                      <input inputMode="numeric" value={it.grams} onChange={e => setItem(i, { grams: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 70, textAlign: 'center' }} aria-label="Grams" />
                      <span>g</span>
                      <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setItem(i, { grams: Math.round(it.grams * 1.25) })}>+</button>
                      <span className="muted" style={{ marginLeft: 'auto' }}>{t.kcal} kcal · P {t.p} · C {t.c} · F {t.f}</span>
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14 }}>
                <span>Total</span><span>{tot.kcal} kcal · P {tot.p} · C {tot.c} · F {tot.f}</span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {res.confidence === 'low' ? '⚠️ Low confidence. Double-check these. ' : ''}Photo estimates are usually within about 100–150 kcal. On a tight cut or peak week, weigh it or scan the barcode instead.
              </div>
              <button className="btn" onClick={log} disabled={!!busy}>{busy === 'log' ? 'Logging…' : `Log to ${slot}`}</button>
            </>
          )}
          <button className="btn-ghost" onClick={reset} disabled={!!busy}>Start over</button>
        </>
      )}
      {err && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{err}</p>}
      {res?.left !== undefined && res.left <= 5 && <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>{res.left} photo estimates left today.</p>}
    </div>
  )
}
