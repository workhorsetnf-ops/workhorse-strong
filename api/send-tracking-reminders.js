// Daily job that tags a client's GoHighLevel contact when they haven't logged food and/or
// steps yet today. This function does NOT send any SMS/email itself — it only manages tags.
// You build a GHL Workflow (trigger: "Tag Added") that does the actual sending. That split
// means you can change the message wording, timing, or add follow-ups entirely inside GHL,
// with zero code changes.
//
// Triggered once a day by Vercel Cron (see vercel.json) — not called by the app itself.
//
// Required environment variables (Vercel project Settings > Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  - the "service_role" secret key from Supabase
//                                 (Project Settings > API). NOT the anon key — this needs
//                                 to read every client's rows, bypassing RLS.
//   GHL_API_TOKEN              - a GoHighLevel Private Integration token
//                                 (in your GHL sub-account: Settings > Private Integrations >
//                                 Create New Integration). Grant it "View Contacts" and
//                                 "Edit Contacts" scopes. The token starts with "pit-".
//   GHL_LOCATION_ID            - your GHL sub-account's Location ID
//                                 (Settings > Business Profile — it's shown there, or visible
//                                 in the URL: app.gohighlevel.com/location/<this part>/...).
//   CRON_SECRET                - any random string. Vercel automatically sends it as a
//                                 Bearer token when it triggers this cron job, which is
//                                 what stops random internet traffic from triggering it.
// Optional:
//   GHL_FOOD_TAG               - tag applied when food isn't logged (default: missed-food-today)
//   GHL_STEPS_TAG              - tag applied when steps aren't logged (default: missed-steps-today)
//   VITE_SUPABASE_URL          - reused automatically; already set for the app itself
//
// Setting up the actual reminder in GoHighLevel (one-time, no code):
//   1. Build a Workflow with trigger "Contact Tag" → event "Tag Added" → tag = missed-food-today.
//      Add whatever SMS/Email action you want inside it. Repeat for missed-steps-today
//      (a second Workflow, or one Workflow with an OR trigger on both tags).
//   2. That's it. This function only adds/removes the tag; GHL handles the actual send.
//
// Every run first REMOVES both tags from a contact before deciding whether to re-add them.
// This is deliberate: GHL's "Tag Added" trigger only fires on the add action, not on a tag
// that's already present. Without the remove-then-reapply, a client who misses tracking
// two days in a row would only get reminded on day one.

import { createClient } from '@supabase/supabase-js'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const {
    VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    GHL_API_TOKEN, GHL_LOCATION_ID,
    GHL_FOOD_TAG, GHL_STEPS_TAG,
  } = process.env

  if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var' })
  }
  if (!GHL_API_TOKEN || !GHL_LOCATION_ID) {
    return res.status(500).json({ error: 'Missing GHL_API_TOKEN or GHL_LOCATION_ID env var' })
  }

  const foodTag = (GHL_FOOD_TAG || 'missed-food-today').trim()
  const stepsTag = (GHL_STEPS_TAG || 'missed-steps-today').trim()
  const today = new Date().toISOString().slice(0, 10)

  function ghlHeaders() {
    return {
      Authorization: `Bearer ${GHL_API_TOKEN}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
    }
  }

  async function findContactByEmail(email) {
    const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(GHL_LOCATION_ID)}&query=${encodeURIComponent(email)}`
    const r = await fetch(url, { headers: ghlHeaders() })
    if (!r.ok) throw new Error(`GHL contact search failed (${r.status}): ${await r.text()}`)
    const data = await r.json()
    const contacts = data.contacts || []
    return contacts.find(c => (c.email || '').toLowerCase() === email.toLowerCase()) || contacts[0] || null
  }

  async function removeTags(contactId, tags) {
    if (!tags.length) return
    const r = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'DELETE', headers: ghlHeaders(), body: JSON.stringify({ tags }),
    })
    // A 404/no-op here (tag wasn't present) is fine — don't fail the whole run over it.
    if (!r.ok && r.status !== 404) throw new Error(`GHL remove tags failed (${r.status}): ${await r.text()}`)
  }

  async function addTags(contactId, tags) {
    if (!tags.length) return
    const r = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'POST', headers: ghlHeaders(), body: JSON.stringify({ tags }),
    })
    if (!r.ok) throw new Error(`GHL add tags failed (${r.status}): ${await r.text()}`)
  }

  try {
    const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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

      try {
        const contact = await findContactByEmail(client.email)
        if (!contact) {
          results.push({ client: client.id, tagged: false, error: 'No matching GHL contact found for this email' })
          continue
        }

        // Reset first so the "Tag Added" trigger reliably fires again today.
        await removeTags(contact.id, [foodTag, stepsTag])

        const tagsToAdd = []
        if (missingFood) tagsToAdd.push(foodTag)
        if (missingSteps) tagsToAdd.push(stepsTag)
        await addTags(contact.id, tagsToAdd)

        await supabase.from('tracking_reminders_sent').insert({
          client_id: client.id,
          sent_date: today,
          missing: missingFood && missingSteps ? 'food+steps' : missingFood ? 'food' : 'steps',
        })
        results.push({ client: client.id, tagged: true, tags: tagsToAdd })
      } catch (err) {
        results.push({ client: client.id, tagged: false, error: err.message })
      }
    }

    return res.status(200).json({ checked: (clients || []).length, tagged: results.filter(r => r.tagged).length, results })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
