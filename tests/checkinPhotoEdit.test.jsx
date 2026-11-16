// @vitest-environment jsdom
// Clients can add, replace or remove progress photos on a check-in they've
// already sent (until the coach marks it reviewed).
import { test, expect, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const uploads = []
const updates = []
let failPose = null
vi.mock('../src/lib/supabase', () => {
  const chain = (table) => {
    let patch = null
    const api = {
      select() { return api }, eq() { return api }, order() { return api }, limit() { return api },
      maybeSingle: async () => ({ data: null, error: null }),
      update(p) { patch = p; return api },
      then(a, b) {
        if (patch) { updates.push([table, patch]); return Promise.resolve({ data: [{ id: 'c1', ...patch }], error: null }).then(a, b) }
        return Promise.resolve({ data: [], error: null }).then(a, b)
      },
    }
    return api
  }
  return {
    supabase: {
      from: chain,
      storage: {
        from: () => ({
          createSignedUrl: async path => ({ data: { signedUrl: 'https://signed/' + path } }),
          upload: async (path) => {
            if (failPose && path.includes('-' + failPose + '-')) return { error: { message: 'nope' } }
            uploads.push(path); return { error: null }
          },
        }),
      },
    },
  }
})

import CheckinEditor, { nextPhotos, currentPhotos } from '../src/pages/CheckinEditor'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.URL.createObjectURL = () => 'blob:preview'
globalThis.URL.revokeObjectURL = () => {}

test('a new pose replaces the old one, others are kept, order is Front/Side/Back', () => {
  const existing = [{ label: 'Back', path: 'u/b' }, { label: 'Front', path: 'u/f' }]
  const r = nextPhotos(existing, [{ label: 'Front', path: 'u/f2' }, { label: 'Side', path: 'u/s' }], [])
  expect(r.photos.map(p => p.label)).toEqual(['Front', 'Side', 'Back'])
  expect(r.photo_urls).toEqual(['u/f2', 'u/s', 'u/b'])
})

test('removing a pose drops it; old unlabelled photos are never dropped', () => {
  const existing = [{ label: '', path: 'old1' }, { label: 'Side', path: 'u/s' }]
  const r = nextPhotos(existing, [], ['Side', 'Front'])
  expect(r.photos).toEqual([{ label: '', path: 'old1' }])
})

test('legacy check-ins read from photo_urls', () => {
  expect(currentPhotos({ photos: [], photo_urls: ['a', 'b'] })).toEqual([{ label: '', path: 'a' }, { label: '', path: 'b' }])
  expect(currentPhotos({ photos: null, photo_urls: null })).toEqual([])
})

async function mount(node) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(node) })
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  return el
}
const btn = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent === text)
async function choose(el, pose) {
  const input = el.querySelector(`input[aria-label="${pose} photo"]`)
  const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}

test('client adds photos to a check-in sent without any', async () => {
  uploads.length = 0; updates.length = 0
  const saved = []
  const checkin = { id: 'c1', client_id: 'u1', photos: [], photo_urls: [], form_responses: [], notes: '' }
  const el = await mount(<CheckinEditor checkin={checkin} photosEditable onSaved={r => saved.push(r)} onCancel={() => {}} />)
  expect(el.textContent).toContain('Add Front')
  await choose(el, 'Front')
  await choose(el, 'Back')
  expect(el.textContent).toContain('Replace Front')
  await act(async () => { btn(el, 'Save changes').click(); await new Promise(r => setTimeout(r, 10)) })
  expect(uploads).toHaveLength(2)
  expect(uploads.every(p => p.startsWith('u1/'))).toBe(true)
  const patch = updates.at(-1)[1]
  expect(patch.photos.map(p => p.label)).toEqual(['Front', 'Back'])
  expect(patch.photo_urls).toEqual(uploads)
  expect(saved).toHaveLength(1)
})

test('replacing one pose keeps the others; a failed upload keeps the old photo', async () => {
  uploads.length = 0; updates.length = 0; failPose = 'side'
  const alerts = []; globalThis.alert = m => alerts.push(m)
  const checkin = { id: 'c1', client_id: 'u1', photos: [{ label: 'Front', path: 'u1/f' }, { label: 'Side', path: 'u1/s' }], form_responses: [] }
  const el = await mount(<CheckinEditor checkin={checkin} photosEditable onSaved={() => {}} onCancel={() => {}} />)
  expect(el.querySelector('img[alt="Front"]').getAttribute('src')).toBe('https://signed/u1/f')
  await choose(el, 'Front')
  await choose(el, 'Side')
  await act(async () => { btn(el, 'Save changes').click(); await new Promise(r => setTimeout(r, 10)) })
  const patch = updates.at(-1)[1]
  expect(patch.photos).toEqual([{ label: 'Front', path: uploads[0] }, { label: 'Side', path: 'u1/s' }])
  expect(alerts.some(a => a.includes('Side'))).toBe(true)
  failPose = null
})

test('coach-side editor shows no photo slots and never touches photos', async () => {
  updates.length = 0
  const checkin = { id: 'c1', client_id: 'u1', photos: [{ label: 'Front', path: 'u1/f' }], form_responses: [] }
  const el = await mount(<CheckinEditor checkin={checkin} onSaved={() => {}} onCancel={() => {}} />)
  expect(el.textContent).not.toContain('Progress photos')
  await act(async () => { btn(el, 'Save changes').click(); await new Promise(r => setTimeout(r, 10)) })
  expect(updates.at(-1)[1].photos).toBeUndefined()
})
