// Daily reminder email for any client who hasn't logged food and/or steps yet today.
// Triggered once a day by Vercel Cron (see vercel.json) — not called by the app itself.
//
// Required environment variables (set these in Vercel project settings > Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  - the "service_role" secret key from Supabase
//                                 (Project Settings > API). NOT the anon key — this needs
//                                 to read every client's rows, bypassing RLS.
//   RESEND_API_KEY             - API key from resend.com (free tier is plenty for this)
//   REMINDER_FROM_EMAIL        - a "from" address on a domain you've verified in Resend,
//                                 e.g. "Coach Name <coach@yourdomain.com>". Resend's shared
//                                 onboarding@resend.dev address will NOT deliver to your
//                                 clients' inboxes — you must verify your own domain first.
//   CRON_SECRET                - any random string. Vercel automatically sends it as a
//                                 Bearer token when it triggers this cron job, which is
//                                 what stops random internet traffic from spamming your clients.
// Optional:
//   APP_URL                    - e.g. https://yourapp.vercel.app — included as a link in the email
//   VITE_SUPABASE_URL          - reused automatically; already set for the app itself

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM_EMAIL, APP_URL } = process.env
  if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var' })
  }
  if (!RESEND_API_KEY || !REMINDER_FROM_EMAIL) {
    return res.status(500).json({ error: 'Missing RESEND_API_KEY or REMINDER_FROM_EMAIL env var' })
  }

  const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)

  try {
    const [{ data: clients, error: cErr }, { data: mealLogs }, { data: dailyLogs }, { data: alreadySent }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('role', 'client'),
      supabase.from('meal_logs').select('client_id').eq('logged_on', today),
      supabase.from('daily_logs').select('client_id, steps').eq('log_date', today),
      supabase.from('tracking_reminders_sent').select('client_id').eq('sent_date', today),
    ])
    if (cErr) throw cErr

    const loggedFood = new Set((mealLogs || []).map(m => m.client_id))
    const loggedSteps = new Set((dailyLogs || []).filter(d => d.steps != null).map(d => d.client_id))
    const alreadySentIds = new Set((alreadySent || []).map(r => r.client_id))

    const results = []
    for (const client of clients || []) {
      if (!client.email || alreadySentIds.has(client.id)) continue
      const missingFood = !loggedFood.has(client.id)
      const missingSteps = !loggedSteps.has(client.id)
      if (!missingFood && !missingSteps) continue

      const what = missingFood && missingSteps ? "today's food and steps" : missingFood ? "today's food" : "today's steps"
      const firstName = (client.full_name || '').split(' ')[0] || 'there'
      const link = APP_URL ? `<p><a href="${APP_URL}">Open Workhorse Strong →</a></p>` : ''
      const html = `<p>Hey ${firstName},</p><p>Quick reminder to log ${what} before you wrap up your day.</p>${link}`

      let sent = false, error = null
      try {
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: REMINDER_FROM_EMAIL, to: client.email, subject: "Don't forget to log today", html }),
        })
        sent = sendRes.ok
        if (!sendRes.ok) error = await sendRes.text()
      } catch (err) {
        error = err.message
      }

      if (sent) {
        await supabase.from('tracking_reminders_sent').insert({
          client_id: client.id,
          sent_date: today,
          missing: missingFood && missingSteps ? 'food+steps' : missingFood ? 'food' : 'steps',
        })
      }
      results.push({ client: client.id, sent, error })
    }

    return res.status(200).json({ checked: (clients || []).length, sent: results.filter(r => r.sent).length, results })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
