import { ACCENTS, usePreferences } from '~/composables/usePreferences'

/**
 * Projects the stored preferences onto the document itself.
 *
 * `data-accent` / `data-density` / `data-text` drive the CSS variables defined in
 * `main.css`, and the `theme-color` meta follows the accent so the browser/PWA
 * chrome matches the app in both light and dark mode.
 */
export function useAppearance() {
  const { prefs, update, patch, accentOption } = usePreferences()
  const colorMode = useColorMode()

  const isDark = computed(() => colorMode.value === 'dark')

  useHead({
    htmlAttrs: {
      'data-accent': () => prefs.value.accent,
      'data-density': () => prefs.value.density,
      'data-text': () => prefs.value.textSize,
      'lang': 'it'
    },
    meta: [
      {
        name: 'theme-color',
        content: () => (isDark.value ? '#020617' : accentOption.value.ink)
      },
      {
        name: 'color-scheme',
        content: () => (isDark.value ? 'dark' : 'light')
      }
    ]
  })

  /** Mirrors the color-mode preference so the settings panel and Navbar agree. */
  const theme = computed<'light' | 'dark' | 'system'>(() => {
    const preference = colorMode.preference
    return preference === 'dark' || preference === 'light' ? preference : 'system'
  })

  function setTheme(next: 'light' | 'dark' | 'system') {
    colorMode.preference = next
  }

  function setAccent(id: (typeof ACCENTS)[number]['id']) {
    update('accent', id)
  }

  return { prefs, update, patch, accentOption, isDark, theme, setTheme, setAccent }
}
