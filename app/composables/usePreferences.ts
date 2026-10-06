import type { GroupStyle, GroupToneId } from '~/utils/groups'

export type AccentId = 'emerald' | 'teal' | 'sky' | 'blue' | 'indigo' | 'violet' | 'rose' | 'amber'
export type Density = 'compact' | 'cozy' | 'comfortable'
export type TextSize = 'small' | 'normal' | 'large'
export type SortOrder = 'created-desc' | 'created-asc' | 'title-asc' | 'group' | 'active-first'

export interface AccentOption {
  id: AccentId
  label: string
  /** Solid colour used for the picker swatch. */
  swatch: string
  /** ~600 shade, used for the PWA theme-color meta tag. */
  ink: string
}

export const ACCENTS: AccentOption[] = [
  { id: 'emerald', label: 'Smeraldo', swatch: '#10b981', ink: '#047857' },
  { id: 'teal', label: 'Verde acqua', swatch: '#14b8a6', ink: '#0f766e' },
  { id: 'sky', label: 'Cielo', swatch: '#0ea5e9', ink: '#0369a1' },
  { id: 'blue', label: 'Blu', swatch: '#3b82f6', ink: '#1d4ed8' },
  { id: 'indigo', label: 'Indaco', swatch: '#6366f1', ink: '#4338ca' },
  { id: 'violet', label: 'Viola', swatch: '#8b5cf6', ink: '#6d28d9' },
  { id: 'rose', label: 'Rosa', swatch: '#f43f5e', ink: '#be123c' },
  { id: 'amber', label: 'Ambra', swatch: '#f59e0b', ink: '#b45309' }
]

export const DENSITIES: { id: Density, label: string, hint: string }[] = [
  { id: 'compact', label: 'Compatta', hint: 'Testo accorciato a 2 righe, più attività a schermo' },
  { id: 'cozy', label: 'Normale', hint: 'Testo completo, spaziatura equilibrata' },
  { id: 'comfortable', label: 'Comoda', hint: 'Testo completo, righe più alte' }
]

export const TEXT_SIZES: { id: TextSize, label: string, hint: string }[] = [
  { id: 'small', label: 'Piccolo', hint: 'Compatto' },
  { id: 'normal', label: 'Medio', hint: 'Predefinito' },
  { id: 'large', label: 'Grande', hint: 'Più leggibile' }
]

export const SORT_ORDERS: { id: SortOrder, label: string }[] = [
  { id: 'created-desc', label: 'Più recenti prima' },
  { id: 'created-asc', label: 'Più vecchie prima' },
  { id: 'active-first', label: 'Da fare prima' },
  { id: 'title-asc', label: 'Titolo (A–Z)' },
  { id: 'group', label: 'Raggruppate per gruppo' }
]

export interface Preferences {
  accent: AccentId
  density: Density
  textSize: TextSize
  sort: SortOrder
  /** Draw a section header for each group while sorting by group. */
  groupSections: boolean
  confirmDelete: boolean
  /** Hide completed activities from the "Tutti" tab. */
  hideCompleted: boolean
  /** Groups the user created, kept even when no activity uses them yet. */
  customGroups: string[]
  /**
   * Presets the user removed. They live in code, so the removal is remembered here
   * and the group stops being offered until it is restored.
   */
  removedGroups: string[]
  groupStyles: Record<string, GroupStyle>
}

export const DEFAULT_PREFERENCES: Preferences = {
  accent: 'emerald',
  density: 'cozy',
  textSize: 'normal',
  sort: 'created-desc',
  groupSections: true,
  confirmDelete: true,
  hideCompleted: false,
  customGroups: [],
  removedGroups: [],
  groupStyles: {}
}

const COOKIE_KEY = 'nt_prefs'

export function normalize(raw: Partial<Preferences> | null | undefined): Preferences {
  const value = raw ?? {}
  return {
    accent: ACCENTS.some(a => a.id === value.accent) ? value.accent as AccentId : DEFAULT_PREFERENCES.accent,
    density: DENSITIES.some(d => d.id === value.density) ? value.density as Density : DEFAULT_PREFERENCES.density,
    textSize: TEXT_SIZES.some(t => t.id === value.textSize) ? value.textSize as TextSize : DEFAULT_PREFERENCES.textSize,
    sort: SORT_ORDERS.some(s => s.id === value.sort) ? value.sort as SortOrder : DEFAULT_PREFERENCES.sort,
    groupSections: value.groupSections ?? DEFAULT_PREFERENCES.groupSections,
    confirmDelete: value.confirmDelete ?? DEFAULT_PREFERENCES.confirmDelete,
    hideCompleted: value.hideCompleted ?? DEFAULT_PREFERENCES.hideCompleted,
    customGroups: Array.isArray(value.customGroups) ? value.customGroups.filter(g => typeof g === 'string') : [],
    removedGroups: Array.isArray(value.removedGroups) ? value.removedGroups.filter(g => typeof g === 'string') : [],
    groupStyles: value.groupStyles && typeof value.groupStyles === 'object' ? value.groupStyles : {}
  }
}

/**
 * The one shared preferences store, created once per app (see
 * `plugins/preferences.ts`) and injected as `$preferences`.
 *
 * Read from the whole app: one cookie ref, one deep watcher and one normalised
 * `computed` for every consumer. Calling `useCookie()` inside `usePreferences()`
 * instead — the previous shape — meant the cookie was re-created for *every*
 * caller, and since `TodoItem` calls it once per row that was one
 * `BroadcastChannel`, one deep watcher, one cookie-jar parse and one deep clone
 * of the whole preferences object *per activity*. Linear in the list length,
 * exactly where a phone feels it most.
 */
export interface PreferencesStore {
  /** Cookie-backed source of truth. Writability is what `update`/`patch` use. */
  stored: Ref<Preferences>
  /** Normalised view of `stored`. */
  prefs: ComputedRef<Preferences>
  accentOption: ComputedRef<AccentOption>
}

export function createPreferencesStore(): PreferencesStore {
  const stored = useCookie<Preferences>(COOKIE_KEY, {
    default: () => ({ ...DEFAULT_PREFERENCES }),
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/'
  })

  const prefs = computed<Preferences>(() => normalize(stored.value))

  return {
    stored,
    prefs,
    accentOption: computed<AccentOption>(
      () => ACCENTS.find(a => a.id === prefs.value.accent) ?? ACCENTS[0]!
    )
  }
}

/**
 * User preferences.
 *
 * Stored in a cookie rather than localStorage on purpose: the accent/density
 * attributes are rendered on <html> during SSR, so a cookie keeps the first
 * paint already correct instead of flashing the default theme on every load.
 */
export function usePreferences() {
  const { stored, prefs, accentOption } = useNuxtApp().$preferences

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    stored.value = { ...normalize(stored.value), [key]: value }
  }

  /** Merge a partial change into the stored preferences. */
  function patch(changes: Partial<Preferences>) {
    stored.value = normalize({ ...normalize(stored.value), ...changes })
  }

  function setGroupStyle(name: string, style: Partial<GroupStyle>) {
    const clean = (name || '').trim()
    if (!clean) return
    const current = normalize(stored.value)
    update('groupStyles', {
      ...current.groupStyles,
      [clean]: {
        tone: (style.tone ?? current.groupStyles[clean]?.tone ?? 'slate') as GroupToneId,
        icon: style.icon ?? current.groupStyles[clean]?.icon ?? 'i-lucide-tag'
      }
    })
  }

  function addCustomGroup(name: string) {
    const clean = (name || '').trim()
    if (!clean) return
    const current = normalize(prefs.value)
    const exists = current.customGroups.some(g => g.toLowerCase() === clean.toLowerCase())
    if (exists) return
    update('customGroups', [...current.customGroups, clean])
  }

  function removeCustomGroup(name: string) {
    const clean = name.trim().toLowerCase()
    const current = normalize(prefs.value)
    const styles = { ...current.groupStyles }
    const target = Object.keys(styles).find(k => k.toLowerCase() === clean)
    if (target) {
      delete styles[target]
    }
    update('customGroups', current.customGroups.filter(g => g.toLowerCase() !== clean))
    update('groupStyles', styles)
  }

  /** Remember that a preset group was removed (its activities are re-homed first). */
  function markGroupRemoved(name: string) {
    const clean = (name || '').trim()
    if (!clean) return
    const current = normalize(prefs.value)
    if (current.removedGroups.some(g => g.toLowerCase() === clean.toLowerCase())) return
    update('removedGroups', [...current.removedGroups, clean])
  }

  /**
   * Bring preset groups back. Called with no argument to restore every removed
   * group at once. The style override is intentionally kept, so a restored preset
   * looks the way the user had customised it.
   */
  function restoreGroups(name?: string) {
    const current = normalize(prefs.value)
    if (!name) {
      update('removedGroups', [])
      return
    }
    const clean = name.trim().toLowerCase()
    update('removedGroups', current.removedGroups.filter(g => g.toLowerCase() !== clean))
  }

  function reset() {
    stored.value = { ...DEFAULT_PREFERENCES, customGroups: [], groupStyles: {} }
  }

  return {
    prefs,
    accentOption,
    update,
    patch,
    setGroupStyle,
    addCustomGroup,
    removeCustomGroup,
    markGroupRemoved,
    restoreGroups,
    reset,
    normalize
  }
}
