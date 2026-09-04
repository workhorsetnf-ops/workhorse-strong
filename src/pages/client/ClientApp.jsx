import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { Home, Dumbbell, Utensils, ClipboardCheck, LineChart, Video, Trophy, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import ClientHome from './ClientHome'
import ClientTraining from './ClientTraining'
import ClientNutrition from './ClientNutrition'
import ClientMessages from './ClientMessages'
import ClientCheckin from './ClientCheckin'
import ClientProgress from './ClientProgress'
import ClientFormChecks from './ClientFormChecks'
import ClientLeaderboard from './ClientLeaderboard'
import ClientResources from './ClientResources'
import ClientRoadmap from './ClientRoadmap'
import ClientCommunity from '../ClientCommunity'
import ClientRecap from './ClientRecap'
import ClientFAQ from './ClientFAQ'
import ClientCalendar from './ClientCalendar'
import ClientIntakeForms from './ClientIntakeForms'
import ClientContracts from './ClientContracts'
import ClientDocuments from './ClientDocuments'
import ContractPrint from '../ContractPrint'

function Dot() {
  return <span style={{ position: 'absolute', top: 4, right: '28%', width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', border: '1.5px solid var(--coal)' }} />
}

export default function ClientApp() {
  const { profile } = useAuth()
  const location = useLocation()
  const [badges, setBadges] = useState({ messages: false, checkin: false, filmChecks: false })

  async function refreshBadges() {
    if (!profile) return
    const [{ count: msgCount }, { data: lastCheckin }, { data: myForms }] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', profile.id).is('read_at', null),
      supabase.from('checkins').select('submitted_at').eq('client_id', profile.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('form_checks').select('id').eq('client_id', profile.id),
    ])
    const checkinDue = !lastCheckin || (Date.now() - new Date(lastCheckin.submitted_at).getTime()) / 864e5 >= 6

    let filmChecks = false
    const formIds = (myForms || []).map(f => f.id)
    if (formIds.length) {
      const { count } = await supabase.from('form_check_comments').select('id', { count: 'exact', head: true })
        .in('form_check_id', formIds).neq('sender_id', profile.id).is('read_at', null)
      filmChecks = (count || 0) > 0
    }

    setBadges({ messages: (msgCount || 0) > 0, checkin: checkinDue, filmChecks })
  }

  useEffect(() => { refreshBadges() }, [profile])
  // re-check whenever the client navigates — covers "just read it, badge should clear"
  useEffect(() => { const t = setTimeout(refreshBadges, 400); return () => clearTimeout(t) }, [location.pathname])

  return (
    <div className="client-shell">
      <main className="client-main">
        <Routes>
          <Route index element={<ClientHome />} />
          <Route path="training" element={<ClientTraining />} />
          <Route path="nutrition" element={<ClientNutrition />} />
          <Route path="messages" element={<ClientMessages />} />
          <Route path="checkin" element={<ClientCheckin />} />
          <Route path="progress" element={<ClientProgress />} />
          <Route path="form-checks" element={<ClientFormChecks />} />
          <Route path="challenges" element={<ClientLeaderboard />} />
          <Route path="resources" element={<ClientResources />} />
          <Route path="roadmap" element={<ClientRoadmap />} />
          <Route path="community" element={<ClientCommunity />} />
          <Route path="recap" element={<ClientRecap />} />
          <Route path="faq" element={<ClientFAQ />} />
          <Route path="calendar" element={<ClientCalendar />} />
          <Route path="intake-forms" element={<ClientIntakeForms />} />
          <Route path="contracts" element={<ClientContracts />} />
          <Route path="contracts/print/:contractId" element={<ContractPrint />} />
          <Route path="documents" element={<ClientDocuments />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        <NavLink to="/app" end><span className="ico"><Home size={19} strokeWidth={2} /></span>Home</NavLink>
        <NavLink to="/app/training"><span className="ico"><Dumbbell size={19} strokeWidth={2} /></span>Train</NavLink>
        <NavLink to="/app/nutrition"><span className="ico"><Utensils size={19} strokeWidth={2} /></span>Eat</NavLink>
        <NavLink to="/app/checkin" style={{ position: 'relative' }}><span className="ico"><ClipboardCheck size={19} strokeWidth={2} /></span>Check-in{badges.checkin && <Dot />}</NavLink>
        <NavLink to="/app/progress"><span className="ico"><LineChart size={19} strokeWidth={2} /></span>Log</NavLink>
        <NavLink to="/app/form-checks" style={{ position: 'relative' }}><span className="ico"><Video size={19} strokeWidth={2} /></span>Film{badges.filmChecks && <Dot />}</NavLink>
        <NavLink to="/app/challenges"><span className="ico"><Trophy size={19} strokeWidth={2} /></span>Rank</NavLink>
        <NavLink to="/app/messages" style={{ position: 'relative' }}><span className="ico"><MessageCircle size={19} strokeWidth={2} /></span>Coach{badges.messages && <Dot />}</NavLink>
      </nav>
    </div>
  )
}
