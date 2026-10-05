export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  icon?: string
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions | null
}

/**
 * Promise-based confirmation dialog.
 *
 * `await confirm({ ... })` resolves true only when the user actually confirms,
 * which keeps destructive actions (delete activity, clear completed, delete a
 * group) honest without a modal component per call site.
 *
 * The resolver lives at module scope because it is a function, not app state:
 * it is only ever set from a client-side event handler.
 */
let pendingResolver: ((value: boolean) => void) | null = null

export function useConfirm() {
  const state = useState<ConfirmState>('confirm-dialog', () => ({ open: false, options: null }))

  function ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // A second request supersedes the first: answer the stale one with "no".
      pendingResolver?.(false)
      pendingResolver = resolve
      state.value = { open: true, options }
    })
  }

  function answer(value: boolean) {
    const resolve = pendingResolver
    pendingResolver = null
    state.value = { open: false, options: null }
    resolve?.(value)
  }

  return { state, ask, answer }
}
