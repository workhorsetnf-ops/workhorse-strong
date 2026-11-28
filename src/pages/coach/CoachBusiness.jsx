// Business overview, CoachRx-style (Update 191): a stats strip across the top
// and cards into Pipeline, Contracts and Testimonials. Payments run through
// Newie, outside the app, so revenue isn't shown here.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Target, ClipboardSignature, Quote, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { businessStats } from '../../lib/coachRoster'

export default function CoachBusiness() {
  const [s, setS] = useState(null)
  useEffect(() => {
    Promise.all([
      supabase.from('lead_stages').select('*'),
      supabase.from('leads').select('id, stage_id, deal_size, archived, stage_changed_at, next_action_date'),
      supabase.from('profiles').select('id, status, status_changed_at, created_at').eq('role', 'client'),
      supabase.from('contracts').select('id, status, signed_at'),
    ]).then(([st, ld, cl, ct]) => setS(businessStats({
      stages: st.data || [], leads: ld.data || [], clients: cl.data || [], contracts: ct.error ? [] : ct.data || [], today: localDateStr(),
    })))
  }, [])
  const v = (x, money) => (s ? (money ? '$' + Number(x).toLocaleString() : x) : '–')

  return (
    <div>
      <h1 style={{ fontSize: 30, marginBottom: 18 }}>Business</h1>
      <div className="rx-stats">
        <div><div className="num" data-stat="active">{v(s?.activeClients)}</div><div className="lbl">Active clients</div></div>
        <div><div className="num">{v(s?.newThisMonth)}</div><div className="lbl">New this month</div></div>
        <div><div className="num">{v(s?.pipelineValue, true)}</div><div className="lbl">Pipeline value</div></div>
        <div><div className="num">{v(s?.wonThisMonth)}</div><div className="lbl">Won this month</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <Card to="/coach/pipeline" icon={Target} title="Pipeline" lines={[`${v(s?.openLeads)} open lead${s?.openLeads === 1 ? '' : 's'}`, `${v(s?.followUpsDue)} follow-up${s?.followUpsDue === 1 ? '' : 's'} due`]} warn={s?.followUpsDue > 0} />
        <Card to="/coach/contracts" icon={ClipboardSignature} title="Contracts / waivers" lines={[`${v(s?.contractsOut)} waiting to be signed`, `${v(s?.contractsSigned)} signed this month`]} />
        <Card to="/coach/testimonials" icon={Quote} title="Testimonials" lines={['Wins your clients have shared']} />
      </div>

      <div className="rx-panel" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Mini label="Paused clients" value={v(s?.pausedClients)} />
        <Mini label="Left this month" value={v(s?.exitedThisMonth)} />
        <Mini label="Open leads" value={v(s?.openLeads)} />
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Payments and revenue live in Newie, so they aren't shown here.</p>
    </div>
  )
}

function Card({ to, icon: Icon, title, lines, warn }) {
  return (
    <Link to={to} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit' }}>
      <span style={{ width: 46, height: 46, borderRadius: 10, background: 'var(--steel)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={22} color="var(--orange-hot)" /></span>
      <span style={{ flex: 1 }}>
        <strong style={{ display: 'block', fontSize: 17 }}>{title}</strong>
        {lines.map((l, i) => <span key={i} className="muted" style={{ display: 'block', fontSize: 13.5, color: warn && i === 1 ? 'var(--orange-hot)' : undefined }}>{l}</span>)}
      </span>
      <ChevronRight size={20} color="var(--muted)" />
    </Link>
  )
}
const Mini = ({ label, value }) => (
  <div><div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div><div className="muted" style={{ fontSize: 12.5 }}>{label}</div></div>
)
