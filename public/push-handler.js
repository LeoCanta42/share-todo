/**
 * Service Worker push notification & click handler.
 *
 * This file is loaded through workbox's `importScripts` *and* injected verbatim
 * at the top of the generated service worker (see scripts/patch-sw.mjs), so the
 * listener is registered synchronously during the worker's first evaluation: a
 * push that wakes a closed app must never be missed because a handler was
 * registered a tick too late.
 *
 * Every received push is also recorded in Cache Storage (most recent first) with
 * when it arrived, when the server sent it, and whether the notification could be
 * shown. The app reads that log under Settings → Diagnostica notifiche, which is
 * the only way to tell a notification the phone surfaces late from one that never
 * arrived at the device at all.
 */

if (!self.__shareTodoPushHandlerRegistered) {
  self.__shareTodoPushHandlerRegistered = true

  const PUSH_LOG_CACHE = 'sharetodo-push-log'
  const PUSH_LOG_URL = '/__push-log.json'
  const PUSH_LOG_LIMIT = 20

  async function readPushLog() {
    try {
      const cache = await caches.open(PUSH_LOG_CACHE)
      const response = await cache.match(PUSH_LOG_URL)
      return response ? await response.json() : []
    } catch {
      return []
    }
  }

  async function writePushLog(entries) {
    try {
      const cache = await caches.open(PUSH_LOG_CACHE)
      await cache.put(PUSH_LOG_URL, new Response(JSON.stringify(entries.slice(0, PUSH_LOG_LIMIT)), {
        headers: { 'Content-Type': 'application/json' }
      }))
    } catch {
      // Losing the log only costs diagnostics.
    }
  }

  async function recordPushReceipt(receipt) {
    const entries = await readPushLog()
    entries.unshift(receipt)
    await writePushLog(entries)
  }

  self.addEventListener('push', (event) => {
    const receivedAt = new Date().toISOString()

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
    const sentAt = typeof data.sentAt === 'number' ? data.sentAt : null

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

    event.waitUntil((async () => {
      let shown = true
      let error = null

      try {
        await self.registration.showNotification(title, options)
      } catch (err) {
        console.warn('showNotification retry with minimal options:', err)
        try {
          await self.registration.showNotification(title, { body, data: { url } })
        } catch (retryErr) {
          shown = false
          error = String((retryErr && retryErr.message) || retryErr)
          console.error('showNotification failed:', retryErr)
        }
      }

      await recordPushReceipt({
        at: receivedAt,
        title,
        tag,
        sentAt,
        lateByMs: sentAt ? Date.now() - sentAt : null,
        shown,
        error
      })
    })())
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

  // The app asks for the receipt log. Every window client gets the answer, so the
  // reply does not depend on `event.source` being populated.
  self.addEventListener('message', (event) => {
    const message = event.data || {}
    if (message.type !== 'sharetodo:push-log') return

    event.waitUntil((async () => {
      const entries = await readPushLog()
      const clientList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      for (const client of clientList) {
        client.postMessage({
          type: 'sharetodo:push-log',
          requestId: message.requestId || null,
          entries
        })
      }
    })())
  })
}
