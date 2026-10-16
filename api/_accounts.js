// Creating client accounts on the server (needs the service-role key, which
// never reaches the browser). Accounts are created already confirmed, so no
// confirmation email is needed.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function checkNewAccount({ full_name, email, password }) {
  const name = String(full_name || '').trim()
  const mail = String(email || '').trim().toLowerCase()
  if (name.length < 2) return { error: 'Please enter your full name.' }
  if (!EMAIL.test(mail)) return { error: 'That email doesn’t look right.' }
  if (String(password || '').length < 8) return { error: 'Password needs at least 8 characters.' }
  return { name, mail }
}

export async function createClientAccount(sb, { name, mail, password }) {
  const { data, error } = await sb.auth.admin.createUser({
    email: mail, password, email_confirm: true, user_metadata: { full_name: name },
  })
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return { error: 'An account with this email already exists. Sign in instead, or use “Forgot password?”.', status: 409 }
    return { error: error.message, status: 400 }
  }
  // the sign-up trigger creates the profile; make sure name/email/role are set
  await sb.from('profiles').upsert({ id: data.user.id, full_name: name, email: mail, role: 'client' }, { onConflict: 'id' })
  return { user: data.user }
}
