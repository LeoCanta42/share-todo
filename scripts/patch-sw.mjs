import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const PUSH_HEADER = `/* [SHARE-TODO-PUSH-START] */
/**
 * ShareToDo Push Notification & Click Handler
 * Injected at the top of the Service Worker to guarantee synchronous registration
 * so background push wakeups on mobile (Android/iOS) are never dropped by the browser.
 */
if (!self.__shareTodoPushHandlerRegistered) {
  self.__shareTodoPushHandlerRegistered = true;

  self.addEventListener('push', (event) => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      try {
        data = {
          title: 'ShareToDo — Promemoria',
          body: event.data ? event.data.text() : 'Hai un\\'attività in scadenza'
        };
      } catch {
        data = { title: 'ShareToDo — Promemoria', body: 'Hai un\\'attività in scadenza' };
      }
    }

    const title = data.title || 'ShareToDo — Promemoria';
    const body = data.body || 'Hai un\\'attività in scadenza';
    const url = (data.data && data.data.url) || data.url || '/';
    const iconUrl = self.location.origin + '/icons/icon-192.png';
    const tag = data.tag || ('todo-' + Date.now());

    const options = {
      body,
      icon: iconUrl,
      tag,
      data: {
        url,
        ...(data.data || {})
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
        .catch((err) => {
          console.warn('[sw] showNotification retry with minimal options:', err);
          return self.registration.showNotification(title, { body, data: { url } });
        })
        .catch((err2) => {
          console.error('[sw] showNotification fallback failed:', err2);
        })
    );
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            if ('navigate' in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  });
}
/* [SHARE-TODO-PUSH-END] */`

export function patchServiceWorkerFiles() {
  const possiblePaths = [
    path.join(rootDir, '.vercel', 'output', 'static', 'sw.js'),
    path.join(rootDir, '.output', 'public', 'sw.js'),
    path.join(rootDir, 'dist', 'sw.js')
  ]

  let patchedCount = 0

  for (const swPath of possiblePaths) {
    if (!fs.existsSync(swPath)) continue

    let content = fs.readFileSync(swPath, 'utf8')

    // Strip previous injections if present
    const delimitedRegex = /\/\* \[SHARE-TODO-PUSH-START\] \*\/[\s\S]*?\/\* \[SHARE-TODO-PUSH-END\] \*\/\n?/
    if (delimitedRegex.test(content)) {
      content = content.replace(delimitedRegex, '')
    } else if (content.includes('ShareToDo Push Notification & Click Handler')) {
      // Legacy un-delimited injection removal
      const splitIdx = content.indexOf('if(!self.define)')
      if (splitIdx !== -1) {
        content = content.slice(splitIdx)
      } else {
        const altIdx = content.indexOf('define([')
        if (altIdx !== -1) {
          content = content.slice(altIdx)
        }
      }
    }

    const newContent = `${PUSH_HEADER}\n${content.trimStart()}`
    fs.writeFileSync(swPath, newContent, 'utf8')
    console.log(`[patch-sw] Injected synchronous push handler into: ${swPath}`)
    patchedCount++
  }

  return patchedCount
}

// If executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith('patch-sw.mjs')) {
  patchServiceWorkerFiles()
}
