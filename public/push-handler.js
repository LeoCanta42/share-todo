/**
 * Service Worker push notification & click handler.
 *
 * Loaded both through workbox's `importScripts` and injected verbatim at the top of
 * the generated service worker (see scripts/patch-sw.mjs), so the `push` listener
 * exists from the worker's first synchronous evaluation: a push that wakes a closed
 * app must never be missed because its handler was registered a tick too late.
 */

if (!self.__shareTodoPushHandlerRegistered) {
  self.__shareTodoPushHandlerRegistered = true

  self.addEventListener('push', (event) => {
    let data = {}
    try {
      data = event.data ? event.data.json() : {}
    } catch (err) {
      try {
        data = {
          title: 'ShareToDo — Promemoria',
          body: event.data ? event.data.text() : 'Hai un\'attività in scadenza'
        }
      } catch {
        data = { title: 'ShareToDo — Promemoria', body: 'Hai un\'attività in scadenza' }
      }
    }

    const title = data.title || 'ShareToDo — Promemoria'
    const body = data.body || 'Hai un\'attività in scadenza'
    const rawUrl = (data.data && data.data.url) || data.url || '/'
    const url = new URL(rawUrl, self.location.origin).href
    const icon = data.icon || '/icons/icon-192.png'
    const badge = data.badge || '/icons/icon-192.png'
    const tag = data.tag || `todo-${Date.now()}`

    const options = {
      body,
      icon,
      badge,
      tag,
      vibrate: [200, 100, 200],
      renotify: true,
      data: {
        url,
        ...(data.data || {})
      }
    }

    event.waitUntil(
      self.registration.showNotification(title, options).catch((err) => {
        console.warn('showNotification retry with minimal options:', err)
        return self.registration.showNotification(title, {
          body,
          icon,
          tag,
          data: { url }
        })
      })
    )
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const rawUrl = (event.notification.data && event.notification.data.url) || '/'
    const targetUrl = new URL(rawUrl, self.location.origin).href

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if ('navigate' in client && client.url !== targetUrl) {
              client.navigate(targetUrl)
            }
            return client.focus()
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      })
    )
  })
}
