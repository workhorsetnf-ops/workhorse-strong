import { useState } from 'react'

// Every word typed has to appear somewhere in the food's name or category,
// in any order: "chicken tyson" finds "Tyson Frozen Chicken Breast (raw)".
export function matchFoods(foods, query, limit = 8) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored = []
  for (const f of foods || []) {
    const name = String(f.name || '').toLowerCase()
    const hay = name + ' ' + String(f.category || '').toLowerCase()
    if (!words.every(w => hay.includes(w))) continue
    // name starts with the first word > a word in the name starts with it > anywhere
    const first = words[0]
    const score = name.startsWith(first) ? 0 : (' ' + name).includes(' ' + first) || name.includes('(' + first) ? 1 : 2
    scored.push([score, f])
  }
  scored.sort((a, b) => a[0] - b[0] || String(a[1].name).localeCompare(String(b[1].name)))
  return scored.slice(0, limit).map(s => s[1])
}

const n1 = v => { const x = Number(v) || 0; return Math.round(x * 10) / 10 }

// Search-as-you-type food box. Replaces the browser's <datalist>, which iPhones
// barely show (a few words above the keyboard, or nothing in the home-screen app).
// The list renders inline, not floating, so the table's horizontal scroll can't clip it.
export default function FoodPicker({ foods, value, onChange, onPick, onAddUnknown, onFocus, placeholder, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const text = value || ''
  const matches = open ? matchFoods(foods, text) : []
  const exact = matches.find(f => f.name.toLowerCase() === text.trim().toLowerCase())

  const pick = f => { setOpen(false); setHi(0); onPick(f) }
  const submit = () => {
    if (!text.trim()) return
    if (exact) return pick(exact)
    if (matches[hi]) return pick(matches[hi])
    setOpen(false); onAddUnknown(text.trim())
  }

  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={text} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off" autoCorrect="off" spellCheck={false}
          role="combobox" aria-expanded={matches.length > 0} aria-autocomplete="list"
          onFocus={() => { setOpen(true); onFocus && onFocus() }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { onChange(e.target.value); setOpen(true); setHi(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, Math.max(matches.length - 1, 0))) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); submit() }
            else if (e.key === 'Escape') setOpen(false)
          }}
          style={{ padding: '8px 10px', fontSize: 14, flex: 1, minWidth: 0 }} />
        <button className="btn-ghost" onMouseDown={e => e.preventDefault()} onClick={submit} style={{ padding: '7px 12px', fontSize: 13 }}>Add</button>
      </div>
      {open && text.trim() && (
        <div role="listbox" style={{ marginTop: 4, border: '1px solid var(--line, #333)', borderRadius: 8, overflow: 'hidden', background: 'var(--steel, #151515)' }}>
          {matches.map((f, i) => (
            <button key={f.id} type="button" role="option" aria-selected={i === hi}
              onMouseDown={e => e.preventDefault()} onClick={() => pick(f)} onMouseEnter={() => setHi(i)}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', textAlign: 'left',
                padding: '10px 12px', border: 'none', borderTop: i ? '1px solid var(--line, #2a2a2a)' : 'none', cursor: 'pointer',
                background: i === hi ? 'rgba(255,122,26,.16)' : 'transparent', color: 'inherit', fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{f.name}</span>
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{n1(f.protein)}P · {n1(f.carbs)}C · {n1(f.fat)}F</span>
            </button>
          ))}
          {!exact && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setOpen(false); onAddUnknown(text.trim()) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderTop: matches.length ? '1px solid var(--line, #2a2a2a)' : 'none',
                background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
              {matches.length ? `Not listed? Add "${text.trim()}" with no macros` : `No library match. Add "${text.trim()}" with no macros`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
