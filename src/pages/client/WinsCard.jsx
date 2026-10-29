// Client Home, Friday to Monday: the week's wins, with a share-ready image.
import { useEffect, useState } from 'react'
import { Share2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, mondayOf, weekDaysFrom, logDate } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { prsInRange } from '../../lib/prs'
import { winsWeek, winsStats } from '../../lib/wins'

export default function WinsCard({ profile }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!profile?.id) return
    const today = localDateStr()
    const wk = winsWeek(today, new Date().getDay(), mondayOf, addDays)
    if (!wk) return
    const days = weekDaysFrom(wk.monday), prevDays = weekDaysFrom(addDays(wk.monday, -7))
    ;(async () => {
      const [wl, dl, ml] = await Promise.all([
        supabase.from('workout_logs').select('exercise_name, weight, reps, logged_date, logged_at, session_track').eq('client_id', profile.id).lte('logged_at', new Date(days[6] + 'T23:59:59').toISOString()).limit(10000),
        supabase.from('daily_logs').select('log_date, weight, steps').eq('client_id', profile.id).gte('log_date', prevDays[0]).lte('log_date', days[6]),
        supabase.from('meal_logs').select('logged_on').eq('client_id', profile.id).gte('logged_on', days[0]).lte('logged_on', days[6]),
      ])
      const all = (wl.data || []).map(r => ({ ...r, logged_date: logDate(r) })).filter(r => r.logged_date)
      const lifts = all.filter(r => r.session_track !== 'conditioning')
      const workoutDates = new Set(all.map(r => r.logged_date))
      const prs = prsInRange(lifts.filter(r => r.weight && r.reps), days[0], days[6])
      setSt({ ...winsStats({ days, prevDays, workoutDates, daily: dl.data || [], meals: ml.data || [], prs }), label: wk.label, monday: wk.monday })
    })()
  }, [profile?.id])
  if (!st || (!st.sessions && !st.prs && !st.foodDays)) return null

  const phase = profile?.phase || 'cut'
  const wGood = st.weightChange !== null && (phase === 'cut' ? st.weightChange < 0 : phase === 'build' ? st.weightChange > 0 : Math.abs(st.weightChange) <= 1)
  const tiles = [
    ['Sessions', st.sessions],
    ['PRs', st.prs],
    st.weightChange !== null && wGood && ['Weight', `${st.weightChange > 0 ? '+' : ''}${st.weightChange} lb`],
    st.steps && ['Avg steps', st.steps.toLocaleString()],
    ['Days fed & logged', `${st.foodDays}/7`],
  ].filter(Boolean)

  async function share() {
    setBusy(true)
    try {
      const blob = await drawCard({ name: String(profile.full_name || '').split(/\s+/)[0], label: st.label, monday: st.monday, tiles, topPr: st.topPr })
      const file = new File([blob], 'workhorse-week.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My week' })
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'workhorse-week.png'; a.click() }
    } catch { /* cancelled */ }
    setBusy(false)
  }

  return (
    <div className="card" style={{ background: 'linear-gradient(135deg, rgba(255,106,0,.18), rgba(255,106,0,.04))', borderColor: 'var(--orange)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 16 }}>💪 {st.label}’s wins</strong>
        <button className="btn-ghost" onClick={share} disabled={busy} style={{ padding: '5px 11px', fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><Share2 size={13} /> {busy ? '…' : 'Share'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tiles.length, 3)}, 1fr)`, gap: 8 }}>
        {tiles.map(([k, v]) => (
          <div key={k} style={{ background: 'var(--coal)', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--orange-hot)' }}>{v}</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{k}</div>
          </div>
        ))}
      </div>
      {st.topPr && <div style={{ fontSize: 13.5, marginTop: 10 }}>🏆 Top PR: <strong>{st.topPr.name}</strong> {st.topPr.weight} × {st.topPr.reps}</div>}
    </div>
  )
}

// 1080 x 1350 (Instagram portrait) image of the week.
async function drawCard({ name, label, monday, tiles, topPr }) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350
  const g = c.getContext('2d')
  g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, 1080, 1350)
  const grad = g.createRadialGradient(540, 0, 50, 540, 0, 900); grad.addColorStop(0, 'rgba(255,106,0,.35)'); grad.addColorStop(1, 'rgba(255,106,0,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1350)
  try { const logo = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = '/icon-512.png' }); g.drawImage(logo, 80, 80, 140, 140) } catch { /* no logo */ }
  g.fillStyle = '#FF6A00'; g.font = '800 40px Oswald, system-ui, sans-serif'; g.fillText('WORKHORSE STRONG', 250, 140)
  g.fillStyle = '#9A9A9A'; g.font = '600 34px system-ui, sans-serif'
  g.fillText(`Week of ${new Date(monday + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`, 250, 192)
  g.fillStyle = '#FFFFFF'; g.font = '900 96px Oswald, system-ui, sans-serif'
  g.fillText(`${(name || 'MY').toUpperCase()}${name ? '’S' : ''} WEEK`, 80, 360)
  tiles.slice(0, 4).forEach(([k, v], i) => {
    const x = 80 + (i % 2) * 470, y = 440 + Math.floor(i / 2) * 290
    g.fillStyle = '#1B1B1B'; roundRect(g, x, y, 450, 260, 28); g.fill()
    g.fillStyle = '#FF6A00'; g.font = '900 110px Oswald, system-ui, sans-serif'; g.fillText(String(v), x + 40, y + 150)
    g.fillStyle = '#BDBDBD'; g.font = '700 38px system-ui, sans-serif'; g.fillText(k.toUpperCase(), x + 40, y + 215)
  })
  if (topPr) { g.fillStyle = '#FFFFFF'; g.font = '700 44px system-ui, sans-serif'; g.fillText(`🏆 ${topPr.name}  ${topPr.weight} × ${topPr.reps}`, 80, 1060) }
  g.fillStyle = '#FF6A00'; g.font = '800 46px Oswald, system-ui, sans-serif'; g.fillText('CLOCK IN. DO THE WORK.', 80, 1250)
  return await new Promise(ok => c.toBlob(ok, 'image/png'))
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }
