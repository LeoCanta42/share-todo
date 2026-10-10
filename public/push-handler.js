/**
 * Service Worker push notification & click handler.
 * Loaded via importScripts in workbox configuration.
 */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
    data = {
      title: 'ShareToDo — Promemoria',
      body: event.data ? event.data.text() : 'Hai un\'attività in scadenza'
    }
  }

  const title = data.title || 'ShareToDo — Promemoria'
  const options = {
    body: data.body || 'Hai un\'attività in scadenza',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    data: data.data || { url: data.url || '/' },
    tag: data.tag || 'share-todo-reminder',
    renotify: true
  }

  event.waitUntil(self.registration.showNotification(title, options))
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
