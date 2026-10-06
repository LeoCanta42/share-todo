type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * Mirrors a count onto the icon of the *installed* app.
 *
 * The Badging API is the only way a web app can put a number on its home-screen
 * icon, and it needs no server at all: it is a client-side call, so a badge
 * showing "how much is still to do" comes free. Support and caveats:
 * - Android/Chrome and iOS 16.4+ in an installed PWA show the badge; every other
 *   context either ignores the call or throws `NotAllowedError`, so failures are
 *   swallowed on purpose — a badge is decoration, never a feature that must work.
 * - The badge belongs to the installation, not the page: it survives a reload and
 *   is only cleared by `clearAppBadge()` (which is why a count of 0 clears it
 *   explicitly rather than just doing nothing).
 *
 * `count` is a getter so the caller decides what is worth badging — the activity
 * count while signed in, 0 while signed out.
 */
export function useAppBadge(count: MaybeRefOrGetter<number>): void {
  function apply(value: number) {
    if (!import.meta.client) return

    const nav = navigator as BadgeNavigator
    const badge = Math.max(0, Math.trunc(value))

    try {
      const result = badge > 0
        ? nav.setAppBadge?.(badge)
        : nav.clearAppBadge?.()
      result?.catch(() => {})
    } catch {
      // Not installed, no notification permission, or no Badging API at all.
    }
  }

  // `post` so the badge is updated after the render that changed the count, not
  // during it — it is fire-and-forget either way.
  watch(() => toValue(count), apply, { immediate: true, flush: 'post' })
}
