import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, authLink } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
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
      .then(({ data }) => { setProfile(data); setLoading(false) })
  }, [session])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, needsPassword, passwordSet: () => setNeedsPassword(false), linkType: authLink.type, refreshProfile: async () => {
      if (!session) return
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(data)
    }}}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
