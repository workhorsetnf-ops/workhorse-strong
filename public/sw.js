// Workhorse Strong service worker: shows push notifications and opens the
// right screen when one is tapped. Kept tiny on purpose (no offline caching).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'Workhorse Strong'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,          // same tag replaces instead of stacking
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  // A call link (Jitsi, Zoom, Meet...) opens on its own instead of pulling the
  // app away from whatever screen it's on.
  if (!url.startsWith(self.location.origin)) {
    event.waitUntil(self.clients.openWindow(url))
    return
  }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin)) { await w.focus(); if ('navigate' in w) return w.navigate(url); return }
    }
    return self.clients.openWindow(url)
  })())
})
