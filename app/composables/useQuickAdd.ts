/**
 * "Focus the quick-add field" signal.
 *
 * Shared state rather than a DOM lookup so the mobile FAB, the manifest shortcut
 * and the empty state all work no matter which page is mounted — and so a request
 * made before the field exists (the approval check can still be running) is not
 * silently dropped: the field reads the latest value when it mounts.
 */
export function useQuickAdd() {
  const focusSignal = useState<number>('quick-add-focus', () => 0)

  function focusQuickAdd() {
    focusSignal.value += 1
    if (import.meta.client) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return { focusSignal, focusQuickAdd }
}
