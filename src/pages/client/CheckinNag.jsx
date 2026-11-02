// Update 158: a due check-in can't be missed.
//  - CheckinBanner: pinned to the top of every screen (except the check-in
//    itself) until it's submitted. No close button.
//  - CheckinTakeover: full-screen card when the app is opened. It can be put
//    off, but comes back the next time the app is opened or brought back to
//    the front (at most once an hour).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, ChevronRight } from 'lucide-react'
import { nagText, showTakeover } from '../../lib/checkinNag'

const KEY = 'ws-checkin-takeover-dismissed'
const getDismissed = () => { try { return Number(sessionStorage.getItem(KEY) || 0) } catch { return 0 } }
const setDismissed = v => { try { sessionStorage.setItem(KEY, String(v)) } catch { /* ignore */ } }

export function CheckinBanner({ status }) {
  const navigate = useNavigate()
  const t = nagText(status)
  if (!t) return null
  const bg = t.tone === 'red' ? 'var(--red)' : 'var(--orange)'
  return (
    <button onClick={() => navigate('/app/checkin')} style={{
      position: 'sticky', top: 0, zIndex: 40, width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      background: bg, color: '#fff', border: 'none', padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 15, fontWeight: 700, textAlign: 'left', boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    }}>
      <ClipboardCheck size={20} />
      <span style={{ flex: 1 }}>{t.title}<span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, opacity: 0.9 }}>Tap to do it now</span></span>
      <ChevronRight size={20} />
    </button>
  )
}

export function CheckinTakeover({ status, onCheckinPage }) {
  const navigate = useNavigate()
  const [dismissed, setDismissedState] = useState(getDismissed)
  const [, force] = useState(0)

  // Coming back to the app re-checks the hour gap.
  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible') force(n => n + 1) }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])

  const t = nagText(status)
  if (!t || onCheckinPage || !showTakeover(status, dismissed)) return null
  const later = () => { const now = Date.now(); setDismissed(now); setDismissedState(now) }
  const go = () => { later(); navigate('/app/checkin') }
  const red = t.tone === 'red'

  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,10,10,0.96)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 18px', display: 'grid', placeItems: 'center',
          background: red ? 'rgba(214,69,69,0.15)' : 'rgba(255,106,0,0.15)', border: `2px solid ${red ? 'var(--red)' : 'var(--orange)'}` }}>
          <ClipboardCheck size={40} color={red ? 'var(--red)' : 'var(--orange)'} />
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, letterSpacing: 1, lineHeight: 1.05, color: red ? 'var(--red)' : 'var(--white)' }}>
          {t.title}
        </div>
        <p className="muted" style={{ fontSize: 15.5, margin: '12px 0 26px' }}>
          {red ? "Your coach can't adjust your plan until it's in. Get it done now." : 'Weigh in, snap your photos and answer a few questions. It takes about 5 minutes.'}
        </p>
        <button className="btn" onClick={go} style={{ width: '100%', padding: '15px 0', fontSize: 18 }}>Do my check-in now</button>
        <button onClick={later} style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--muted)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>
          Remind me later
        </button>
      </div>
    </div>
  )
}
