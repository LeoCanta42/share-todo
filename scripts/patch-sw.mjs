import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const PUSH_HANDLER_PATH = path.join(rootDir, 'public', 'push-handler.js')

const PUSH_START = '/* [SHARE-TODO-PUSH-START] */'
const PUSH_END = '/* [SHARE-TODO-PUSH-END] */'

/**
 * Injects the push handler at the very top of the generated service worker.
 *
 * Workbox already pulls the same file in through `importScripts`, but that runs
 * inside its module bootstrap; putting the handler first guarantees the `push`
 * listener exists from the worker's first synchronous evaluation, so a push that
 * wakes a closed app on mobile cannot be dropped for registering too late.
 *
 * The injected text is read from public/push-handler.js rather than duplicated
 * here, so the two copies cannot drift apart.
 */
export function patchServiceWorkerFiles() {
  if (!fs.existsSync(PUSH_HANDLER_PATH)) {
    console.warn(`[patch-sw] ${PUSH_HANDLER_PATH} is missing: nothing injected`)
    return 0
  }

  const handler = fs.readFileSync(PUSH_HANDLER_PATH, 'utf8').trim()

  if (!handler.includes('__shareTodoPushHandlerRegistered')) {
    console.warn(`[patch-sw] ${PUSH_HANDLER_PATH} does not look like the push handler: nothing injected`)
    return 0
  }

  const pushHeader = `${PUSH_START}\n${handler}\n${PUSH_END}`

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
    } else if (content.includes('__shareTodoPushHandlerRegistered')) {
      // Legacy injection without the delimiters: everything ahead of workbox's own
      // bootstrap is the stale handler.
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

    const newContent = `${pushHeader}\n${content.trimStart()}`
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
