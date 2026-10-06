/**
 * Content another app handed to this one.
 *
 * Android's share sheet posts it to `/share` (see the `share_target` entry in the
 * web manifest): pick "ShareToDo" while sharing a link or some selected text and
 * it arrives here as `?title=…&text=…&url=…`.
 */
export interface SharedContent {
  /** Subject the other app sent along (usually the page title). */
  title: string
  /** The selected text, or the body of the message that was shared. */
  text: string
  /** A link, when what was shared was a link. */
  url: string
}

function readParam(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * One line for the composer, built from whatever arrived.
 *
 * Order matters: `text` is what people usually mean when they share, then the
 * link, then the subject — and each part only once, because Android often sends
 * the page title *and* the URL *and* a text copy of the URL, which would
 * otherwise be pasted three times. A plain function rather than a `computed` on
 * purpose: this is also read from a route middleware, where a computed would
 * register a subscription that nothing ever disposes.
 */
export function composeShareDraft(content: SharedContent | null): string {
  if (!content) return ''

  const parts = [content.text, content.url, content.title]
    .map(part => part.trim())
    .filter(part => part.length > 0)

  return Array.from(new Set(parts)).join(' ')
}

/**
 * The payload stashed by the `share-target` middleware for the `/share` page.
 *
 * Kept in `useState` and not in the page itself: the page only exists once the
 * account is approved, while the share arrives whenever another app sends it —
 * including on the sign-in screen, where the content has to survive the login so
 * it is still there when the composer finally renders.
 */
export function useShareTarget() {
  const content = useState<SharedContent | null>('share-target', () => null)

  /** Store whatever the query string carries; does nothing for an empty query. */
  function capture(query: Record<string, unknown>): boolean {
    const title = readParam(query.title)
    const text = readParam(query.text)
    const url = readParam(query.url)

    if (!title && !text && !url) return false

    content.value = { title, text, url }
    return true
  }

  function clear() {
    content.value = null
  }

  return { content, capture, clear }
}
