/**
 * Service Worker push notification & click handler.
 * Loaded via importScripts in workbox configuration and fallback.
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
    const url = (data.data && data.data.url) || data.url || '/'
    const icon = data.icon || '/icons/icon-192.png'
    const tag = data.tag || `todo-${Date.now()}`

    const options = {
      body,
      icon,
      badge: icon,
      tag,
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
          data: { url }
        })
      })
    )
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const targetUrl = (event.notification.data && event.notification.data.url) || '/'

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            if ('navigate' in client) {
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
