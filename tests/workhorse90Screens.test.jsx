// @vitest-environment jsdom
// Workhorse 90 (Update 180): what members see when joining, at day 90, and the
// monthly call on Home.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

let rows = []
vi.mock('../src/lib/supabase', () => {
  const chain = () => new Proxy(function () {}, {
    get(_, k) { if (k === 'then') return (ok) => Promise.resolve({ data: rows, error: null }).then(ok); return () => chain() },
    apply() { return chain() },
  })
  return { supabase: { from: () => chain() } }
})
const apiCalls = []
vi.mock('../src/lib/push', () => ({ callApi: async (path, body) => { apiCalls.push(body); return { url: '#' } } }))
let auth = {}
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }))

import { GroupPaywall, GroupPaymentBanner, GroupMembershipCard } from '../src/pages/client/GroupMembership'
import GroupCallCard from '../src/pages/client/GroupCallCard'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const DAY = 864e5
async function mount(node) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(node) }); await act(async () => { await new Promise(r => setTimeout(r, 20)) })
  return el
}
const as = profile => { auth = { profile, refreshProfile: async () => {}, signOut: () => {} } }
const buttons = el => [...el.querySelectorAll('button')].map(b => b.textContent)
beforeEach(() => { document.body.innerHTML = ''; apiCalls.length = 0; rows = [] })

test('joining Workhorse 90: both ways to pay, no monthly option', async () => {
  as({ id: 'u1', plan: 'group', group_tier: 'w90', group_status: 'pending' })
  const el = await mount(<GroupPaywall />)
  expect(el.textContent).toContain('Finish joining Workhorse 90')
  expect(buttons(el)).toContain('Pay in full: $495 for 90 days')
  expect(buttons(el)).toContain('2 payments of $249 (today + in 6 weeks)')
  expect(buttons(el).some(b => b.includes('$50/month'))).toBe(false)
  await act(async () => [...el.querySelectorAll('button')].find(b => b.textContent.startsWith('2 payments')).click())
  expect(apiCalls[0]).toEqual({ action: 'checkout', offer: 'w90', option: 'split' })
})

test('day 90: renewal screen with another 90 days or $50/month', async () => {
  as({ id: 'u1', plan: 'group', group_tier: 'w90', group_status: 'active', group_access_until: new Date(Date.now() - DAY).toISOString() })
  const el = await mount(<GroupPaywall />)
  expect(el.textContent).toContain('Your 90 days are up')
  expect(buttons(el).filter(b => b.includes('$495') || b.includes('$249')).length).toBe(2)
  const monthly = [...el.querySelectorAll('button')].find(b => b.textContent.includes('$50/month'))
  await act(async () => monthly.click())
  expect(apiCalls[0]).toEqual({ action: 'checkout', offer: 'monthly' })
})

test('$50/month members: unchanged paywall', async () => {
  as({ id: 'u1', plan: 'group', group_tier: 'monthly', group_status: 'canceled' })
  const el = await mount(<GroupPaywall />)
  expect(buttons(el)).toContain('Rejoin'); expect(el.textContent).not.toContain('$495')
})

test('last 14 days: heads-up with renewal; earlier: nothing', async () => {
  as({ id: 'u1', plan: 'group', group_tier: 'w90', group_status: 'active', group_access_until: new Date(Date.now() + 5 * DAY).toISOString() })
  let el = await mount(<GroupPaymentBanner />)
  expect(el.textContent).toContain('Your Workhorse 90 ends')
  as({ id: 'u1', plan: 'group', group_tier: 'w90', group_status: 'active', group_access_until: new Date(Date.now() + 40 * DAY).toISOString() })
  el = await mount(<GroupPaymentBanner />)
  expect(el.textContent).toBe('')
})

test('membership card shows the end date and the second payment date', async () => {
  as({ id: 'u1', plan: 'group', group_tier: 'w90', group_option: 'split', group_status: 'active', stripe_customer_id: 'cus_1',
       group_access_until: new Date(Date.now() + 80 * DAY).toISOString(), group_period_end: new Date(Date.now() + 32 * DAY).toISOString() })
  const el = await mount(<GroupMembershipCard />)
  expect(el.textContent).toContain('Workhorse 90'); expect(el.textContent).toContain('access until')
  expect(el.textContent).toContain('Second payment of $249')
})

test('Home: next monthly call with a Join link, only for Workhorse 90', async () => {
  rows = [{ id: 'gc1', title: 'December group call', starts_at: new Date(Date.now() + 3 * DAY).toISOString(), duration_minutes: 60, link_url: 'https://zoom.us/j/1', notes: 'Bring questions' }]
  let el = await mount(<GroupCallCard profile={{ id: 'u1', plan: 'group', group_tier: 'w90' }} />)
  expect(el.textContent).toContain('December group call'); expect(el.textContent).toContain('Bring questions')
  expect(el.querySelector('a').getAttribute('href')).toBe('https://zoom.us/j/1')
  el = await mount(<GroupCallCard profile={{ id: 'u2', plan: 'group', group_tier: 'monthly' }} />)
  expect(el.textContent).toBe('')
  rows = []
  el = await mount(<GroupCallCard profile={{ id: 'u1', plan: 'group', group_tier: 'w90' }} />)
  expect(el.textContent).toContain('next date goes up here')
})
