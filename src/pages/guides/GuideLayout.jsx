// Shared layout for the setup guides: big numbered steps, each with a phone
// diagram. Public pages (/guide/...) so a link can be texted to anyone.
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export function GuidePage({ eyebrow, title, intro, tabs, tab, setTab, children }) {
  const { profile } = useAuth() || {}
  const home = profile?.role === 'coach' ? '/coach' : profile ? '/app' : '/'
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--black, #0A0A0A)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="wordmark" style={{ fontSize: 18 }}>Workhorse <span>Strong</span></div>
          <Link to={home} className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>{profile ? '← Back to the app' : 'Open the app'}</Link>
        </div>
        <header>
          <div className="eyebrow">{eyebrow}</div>
          <h1 style={{ fontSize: 30, margin: '6px 0 6px', lineHeight: 1.1 }}>{title}</h1>
          {intro && <p className="muted" style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>{intro}</p>}
        </header>
        {tabs && (
          <div role="tablist" style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, gap: 6, background: 'var(--coal, #141414)', padding: 5, borderRadius: 12, border: '1px solid var(--line, #2a2a2a)' }}>
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={tab === k ? 'btn' : 'btn-ghost'} style={{ padding: '10px 6px', fontSize: 14, border: 'none' }}>{label}</button>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// One step: number + text on the left, diagram on the right (stacked on phones).
export function Step({ n, title, children, art }) {
  return (
    <section className="card guide-step" style={{ padding: 16 }}>
      <div className="guide-step-text">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--orange, #FF6A00)', color: '#000', fontWeight: 900, fontSize: 17, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 19, margin: '4px 0 6px', lineHeight: 1.2, textTransform: 'none', letterSpacing: 0 }}>{title}</h2>
            <div style={{ fontSize: 15, lineHeight: 1.55 }} className="guide-body">{children}</div>
          </div>
        </div>
      </div>
      {art && <div className="guide-step-art">{art}</div>}
    </section>
  )
}

export function Tip({ children, warn }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.5, padding: '10px 12px', borderRadius: 10, marginTop: 10,
      background: warn ? 'rgba(255,59,48,.10)' : 'rgba(255,106,0,.10)', borderLeft: `3px solid ${warn ? '#FF3B30' : 'var(--orange, #FF6A00)'}` }}>{children}</div>
  )
}

export function Help({ title, items }) {
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 19, margin: '0 0 8px', textTransform: 'none', letterSpacing: 0 }}>{title}</h2>
      {items.map(([q, a], i) => (
        <details key={i} style={{ borderTop: '1px solid var(--line, #2a2a2a)', padding: '10px 0' }}>
          <summary style={{ fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{q}</summary>
          <div style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 6 }} className="muted">{a}</div>
        </details>
      ))}
    </section>
  )
}

export const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
