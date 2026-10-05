interface PwaState {
  isInstalled: boolean
  showInstallPrompt: boolean
  needRefresh: boolean
  offlineReady: boolean
  registrationError: boolean
  install: () => Promise<{ outcome: string } | undefined>
  cancelInstall: () => void
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  cancelPrompt: () => Promise<void>
}

/**
 * SSR-safe wrapper around the `$pwa` state provided by @vite-pwa/nuxt.
 *
 * The plugin only runs on the client, so every value here must be read after
 * hydration — `showInstallPrompt` in particular stays false until Chrome fires
 * `beforeinstallprompt`.
 */
export function usePwa() {
  const nuxtApp = useNuxtApp()
  const state = computed<PwaState | null>(() => (nuxtApp.$pwa as unknown as PwaState) ?? null)

  const canInstall = computed(() => Boolean(state.value?.showInstallPrompt))
  const isInstalled = computed(() => Boolean(state.value?.isInstalled))
  const needRefresh = computed(() => Boolean(state.value?.needRefresh))
  const offlineReady = computed(() => Boolean(state.value?.offlineReady))
  const registrationFailed = computed(() => Boolean(state.value?.registrationError))

  async function install(): Promise<string | undefined> {
    try {
      const result = await state.value?.install()
      if (!result) {
        // No deferred prompt available (Safari/Firefox/iOS): the UI falls back to
        // manual instructions when this happens.
        return undefined
      }
      return result.outcome
    } catch (error) {
      console.error('PWA install failed:', error)
      return undefined
    }
  }

  function dismissInstall() {
    state.value?.cancelInstall()
  }

  async function updateApp() {
    await new Promise(resolve => setTimeout(resolve, 400))
    await state.value?.updateServiceWorker(true)
  }

  async function dismissUpdate() {
    await state.value?.cancelPrompt()
  }

  /**
   * iOS never fires `beforeinstallprompt`: the only way to install is Safari's
   * Share sheet, so the settings panel shows instructions instead of a button.
   */
  function isIos(): boolean {
    if (!import.meta.client) return false
    const ua = window.navigator.userAgent
    return /iPhone|iPad|iPod/.test(ua)
      || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  }

  /**
   * Manual instructions for the browsers that never offer a programmatic prompt:
   * iOS/iPadOS Safari, Safari on macOS, and Firefox (which does not support
   * installing web apps at all). Chromium desktop gets the address-bar wording.
   */
  const manualInstallHint = computed<string | undefined>(() => {
    if (!import.meta.client) return undefined

    const ua = window.navigator.userAgent

    if (isIos()) {
      return 'Su iPhone/iPad: tocca Condividi, poi «Aggiungi a Home».'
    }
    if (/Firefox|FxiOS/.test(ua)) {
      return 'Firefox non supporta l\'installazione delle web app: usa Chrome, Edge o Safari.'
    }
    if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) {
      return 'Su Safari per Mac: menu File → «Aggiungi al Dock».'
    }
    return 'Su desktop: icona «Installa» nella barra degli indirizzi di Chrome/Edge, oppure menu del browser → «Installa app».'
  })

  return {
    canInstall,
    isInstalled,
    needRefresh,
    offlineReady,
    registrationFailed,
    manualInstallHint,
    install,
    dismissInstall,
    updateApp,
    dismissUpdate,
    isIos
  }
}
