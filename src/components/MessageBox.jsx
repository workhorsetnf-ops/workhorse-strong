// Message composer (Update 170): the text box gets its own full-width row and
// grows with what you type (up to about 8 lines, then scrolls), with the
// attach / voice / send buttons on the row underneath.
// Enter sends on a computer (Shift+Enter = new line). On a phone, Enter makes
// a new line and the Send button sends, like a normal texting app.
import { useEffect, useRef } from 'react'

const touch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches

export default function MessageBox({ value, onChange, onSend, placeholder, children, maxLines = 8 }) {
  const ref = useRef(null)
  // grow to fit the text, up to maxLines
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cs = getComputedStyle(el)
    const px = k => parseFloat(cs[k]) || 0
    const border = px('borderTopWidth') + px('borderBottomWidth')
    const max = (px('lineHeight') || 23) * maxLines + px('paddingTop') + px('paddingBottom') + border
    el.style.height = 'auto'
    const want = el.scrollHeight + border
    el.style.height = Math.min(want, max) + 'px'
    el.style.overflowY = want > max ? 'auto' : 'hidden'
  }, [value, maxLines])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
      <textarea ref={ref} rows={2} value={value} placeholder={placeholder} aria-label={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !touch()) { e.preventDefault(); onSend() } }}
        style={{ width: '100%', resize: 'none', fontSize: 16, lineHeight: 1.45, minHeight: 64, padding: '10px 12px', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <button className="btn" style={{ marginLeft: 'auto', padding: '10px 20px' }} onClick={onSend}>Send</button>
      </div>
    </div>
  )
}
