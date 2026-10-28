// Browser side of push notifications: is it possible here, turn it on/off, test it.
import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function pushStatus() {
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  return {
    ios, standalone, supported, configured: !!VAPID,
    permission: supported ? Notification.permission : 'unsupported',
    // iPhone only allows push once the app is on the Home Screen
    needsHomeScreen: ios && !standalone,
  }
}

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js')
}

async function currentSub() {
  const reg = await registerSW()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function isSubscribed() {
  try { return !!(await currentSub()) } catch { return false }
}

// Ask permission, subscribe this device, and save it for the server.
export async function enablePush(userId) {
  const st = pushStatus()
  if (!st.supported) throw new Error("This browser can't receive notifications.")
  if (!st.configured) throw new Error('Notifications are not set up on the server yet (missing VITE_VAPID_PUBLIC_KEY).')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked. Turn them on for this app in your phone or browser settings, then try again.' : 'Notifications were not allowed.')
  const reg = await registerSW()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) })
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    device: (navigator.userAgentData?.platform || navigator.platform || '').slice(0, 60),
  }, { onConflict: 'endpoint' })
  if (error) throw new Error('Could not save this device: ' + error.message)
  return true
}

export async function disablePush() {
  const sub = await currentSub()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Calls a server function as the signed-in user.
export async function callApi(path, body) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) })
  let out = {}
  try { out = await r.json() } catch { /* empty */ }
  if (!r.ok) throw new Error(out.error || `Request failed (${r.status})`)
  return out
}

// Fire-and-forget: tell the server something happened (new message, check-in).
export function notifyEvent(type, extra) {
  callApi('/api/push-event', { type, ...extra }).catch(() => {})
}

// Once something has been read in the app, take its notification off the phone's
// lock screen / notification centre too, so it doesn't sit there looking unread.
// tag matches what the server sends: msg-<sender id>, grp-<group id>.
export async function clearShownNotifications(tag) {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg?.getNotifications) return
    const shown = await reg.getNotifications(tag ? { tag } : undefined)
    shown.forEach(n => n.close())
  } catch { /* not supported here: nothing to clear */ }
}

// Ask the client nav to re-count its red dots right away (after marking read).
export function badgesChanged() {
  try { window.dispatchEvent(new Event('ws-badges')) } catch { /* ignore */ }
}
