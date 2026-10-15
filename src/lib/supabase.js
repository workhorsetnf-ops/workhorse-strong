import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Missing Supabase env vars. Copy .env.example to .env and fill in your values.')
}

// Read what kind of email link opened the app BEFORE the client consumes the
// URL: 'invite' (new account) and 'recovery' (forgot password) must lead to a
// "set your password" screen, otherwise the person is never asked for one.
const hash = new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.slice(1) : '')
export const authLink = {
  type: hash.get('type') || null,
  error: hash.get('error_description') ? hash.get('error_description').replace(/\+/g, ' ') : null,
}

export const supabase = createClient(url, anonKey)
