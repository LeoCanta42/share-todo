import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const PUSH_HEADER = `/**
 * ShareToDo Push Notification & Click Handler
 * Injected at the top of the Service Worker to guarantee synchronous registration
 * so background push wakeups on mobile (Android/iOS) are never dropped by the browser.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
    try {
      data = {
        title: 'ShareToDo — Promemoria',
        body: event.data ? event.data.text() : 'Hai un\\'attività in scadenza'
      }
    } catch {
      data = { title: 'ShareToDo — Promemoria', body: 'Hai un\\'attività in scadenza' }
    }
  }

  const title = data.title || 'ShareToDo — Promemoria'
  const body = data.body || 'Hai un\\'attività in scadenza'
  const url = (data.data && data.data.url) || data.url || '/'
  const tag = data.tag || 'share-todo-reminder'

  const options = {
    body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag,
    renotify: true,
    data: {
      url,
      ...(data.data || {})
    }
  }

  // Use event.waitUntil so the mobile OS keeps the worker alive until notification is displayed.
  // Fallback without vibrate/badge in case strict mobile environments (e.g. iOS Safari) reject them.
  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.warn('showNotification retry with minimal options:', err)
      return self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
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
});
`

export function patchServiceWorkerFiles() {
  const possiblePaths = [
    path.join(rootDir, '.vercel', 'output', 'static', 'sw.js'),
    path.join(rootDir, '.output', 'public', 'sw.js'),
    path.join(rootDir, 'dist', 'sw.js')
  ]

  let patchedCount = 0

  for (const swPath of possiblePaths) {
    if (!fs.existsSync(swPath)) continue

    const content = fs.readFileSync(swPath, 'utf8')
    // Check if already patched
    if (content.includes("ShareToDo Push Notification & Click Handler")) {
      console.log(`[patch-sw] File already patched: ${swPath}`)
      continue
    }

    const newContent = `${PUSH_HEADER}\n${content}`
    fs.writeFileSync(swPath, newContent, 'utf8')
    console.log(`[patch-sw] Successfully injected synchronous push handler into: ${swPath}`)
    patchedCount++
  }

  return patchedCount
}

// If executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith('patch-sw.mjs')) {
  patchServiceWorkerFiles()
}
