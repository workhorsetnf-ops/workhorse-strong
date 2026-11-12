import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, authLink, setProgramsLocked } from '../lib/supabase'
import { teamInfo } from '../lib/team'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState(null)   // assistants: the coach whose inbox they work
  // true after an invite or forgot-password link: they must choose a password
  const [needsPassword, setNeedsPassword] = useState(authLink.type === 'invite' || authLink.type === 'recovery')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setNeedsPassword(true)
      setSession(s)
      if (!s) { setProfile(null); setLoading(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(async ({ data }) => {
        // an assistant works the coach's inbox, so look up whose it is first
        if (data?.role === 'assistant') {
          const { data: cid } = await supabase.rpc('coach_id')
          setCoachId(cid || null)
        }
        setProfile(data); setLoading(false)
      })
  }, [session])

  const team = teamInfo(profile, coachId)
  setProgramsLocked(team.programsLocked)   // set during render so it's in place before any page can write

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, needsPassword, ...team, passwordSet: () => setNeedsPassword(false), linkType: authLink.type, refreshProfile: async () => {
      if (!session) return
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(data)
    }}}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
