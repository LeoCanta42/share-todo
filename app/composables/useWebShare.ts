export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable'

export interface ShareRequest {
  title?: string
  text?: string
  url?: string
}

/**
 * The phone's own share sheet, with a clipboard fallback.
 *
 * "Send this to someone" is the one thing a phone does better than a desktop, so
 * an activity or a note can be handed to another app (WhatsApp, mail, anything)
 * instead of being copied and pasted. Where the Web Share API is missing — most
 * desktop browsers — the same button copies to the clipboard, so it always does
 * something useful.
 */
export function useWebShare() {
  const toast = useToast()

  // Filled in after mount, never during SSR: rendering the button one way on the
  // server and another on the client is a hydration mismatch. It simply appears
  // once we can know the answer.
  const canShare = ref(false)

  onMounted(() => {
    canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  })

  function clipboardText(request: ShareRequest): string {
    return [request.title, request.text, request.url]
      .map(part => (part ?? '').trim())
      .filter(part => part.length > 0)
      .join('\n\n')
  }

  async function share(request: ShareRequest): Promise<ShareOutcome> {
    if (!import.meta.client) return 'unavailable'

    const payload: ShareData = {
      title: request.title?.trim() || undefined,
      text: request.text?.trim() || undefined,
      url: request.url?.trim() || undefined
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(payload)
        // The sheet closing *is* the confirmation: a toast on top of it is noise.
        return 'shared'
      } catch (error) {
        // Dismissing the sheet is not an error — and must never fall through to
        // the clipboard, or cancelling would silently copy instead.
        if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled'
        // Anything else (permission, unsupported payload): try the clipboard.
      }
    }

    const text = clipboardText(request)
    if (!text) return 'unavailable'

    try {
      await navigator.clipboard.writeText(text)
      toast.add({
        title: 'Copiato negli appunti',
        description: 'Incollalo dove vuoi condividerlo.',
        color: 'neutral'
      })
      return 'copied'
    } catch {
      toast.add({
        title: 'Condivisione non disponibile',
        description: 'Questo browser non permette di condividere né di copiare.',
        color: 'warning'
      })
      return 'unavailable'
    }
  }

  return { canShare, share }
}
