export type GroupToneId =
  | 'slate'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'fuchsia'
  | 'rose'
  | 'orange'
  | 'amber'
  | 'emerald'
  | 'teal'
  | 'cyan'

export interface GroupTone {
  id: GroupToneId
  label: string
  /** Badge classes: literal strings so Tailwind keeps them in the build. */
  chip: string
  /** Solid swatch used by the colour pickers. */
  swatch: string
}

export const GROUP_TONES: GroupTone[] = [
  { id: 'slate', label: 'Neutro', chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', swatch: 'bg-slate-400' },
  { id: 'sky', label: 'Cielo', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300', swatch: 'bg-sky-500' },
  { id: 'blue', label: 'Blu', chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300', swatch: 'bg-blue-500' },
  { id: 'indigo', label: 'Indaco', chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300', swatch: 'bg-indigo-500' },
  { id: 'violet', label: 'Viola', chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300', swatch: 'bg-violet-500' },
  { id: 'fuchsia', label: 'Fucsia', chip: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/80 dark:text-fuchsia-300', swatch: 'bg-fuchsia-500' },
  { id: 'rose', label: 'Rosa', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300', swatch: 'bg-rose-500' },
  { id: 'orange', label: 'Arancio', chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950/80 dark:text-orange-300', swatch: 'bg-orange-500' },
  { id: 'amber', label: 'Ambra', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300', swatch: 'bg-amber-500' },
  { id: 'emerald', label: 'Smeraldo', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300', swatch: 'bg-emerald-500' },
  { id: 'teal', label: 'Verde acqua', chip: 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300', swatch: 'bg-teal-500' },
  { id: 'cyan', label: 'Ciano', chip: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300', swatch: 'bg-cyan-500' }
]

export function getGroupTone(id: GroupToneId): GroupTone {
  return GROUP_TONES.find(t => t.id === id) ?? GROUP_TONES[0]!
}

/** Icons offered when styling a group. */
export const GROUP_ICONS: string[] = [
  'i-lucide-folder',
  'i-lucide-briefcase',
  'i-lucide-home',
  'i-lucide-shopping-cart',
  'i-lucide-book-open',
  'i-lucide-target',
  'i-lucide-heart',
  'i-lucide-star',
  'i-lucide-flag',
  'i-lucide-lightbulb',
  'i-lucide-dumbbell',
  'i-lucide-plane',
  'i-lucide-music',
  'i-lucide-coffee',
  'i-lucide-code',
  'i-lucide-palette',
  'i-lucide-wallet',
  'i-lucide-graduation-cap',
  'i-lucide-leaf',
  'i-lucide-utensils',
  'i-lucide-car',
  'i-lucide-users'
]

export interface GroupMeta {
  name: string
  /** Badge classes (light + dark). */
  colorClass: string
  icon: string
  tone: GroupToneId
}

export interface GroupStyle {
  tone: GroupToneId
  icon: string
}

export const DEFAULT_GROUPS: GroupMeta[] = [
  { name: 'Generale', colorClass: getGroupTone('slate').chip, icon: 'i-lucide-folder', tone: 'slate' },
  { name: 'Lavoro', colorClass: getGroupTone('blue').chip, icon: 'i-lucide-briefcase', tone: 'blue' },
  { name: 'Casa', colorClass: getGroupTone('violet').chip, icon: 'i-lucide-home', tone: 'violet' },
  { name: 'Spesa', colorClass: getGroupTone('amber').chip, icon: 'i-lucide-shopping-cart', tone: 'amber' },
  { name: 'Studio', colorClass: getGroupTone('emerald').chip, icon: 'i-lucide-book-open', tone: 'emerald' },
  { name: 'Progetto', colorClass: getGroupTone('rose').chip, icon: 'i-lucide-target', tone: 'rose' }
]

const FALLBACK_TONES: GroupToneId[] = ['cyan', 'indigo', 'orange', 'teal', 'fuchsia', 'sky', 'rose', 'amber']

/**
 * Memoised metadata.
 *
 * `getGroupMeta` is called once per row on every list render, and it used to build
 * a fresh object each time: that new identity made Vue re-render every row on any
 * change (props never compared equal). Returning a cached object keeps the prop
 * stable, so only the rows that really changed re-render.
 *
 * Safe at module scope: the value is a pure function of the cache key.
 */
const metaCache = new Map<string, GroupMeta>()

function buildGroupMeta(normalized: string, style?: GroupStyle): GroupMeta {
  const preset = DEFAULT_GROUPS.find(g => g.name.toLowerCase() === normalized.toLowerCase())

  if (preset && !style) {
    return preset
  }

  const tone = style?.tone ?? preset?.tone ?? FALLBACK_TONES[hash(normalized) % FALLBACK_TONES.length]!

  return {
    name: normalized,
    colorClass: getGroupTone(tone).chip,
    icon: style?.icon ?? preset?.icon ?? 'i-lucide-tag',
    tone
  }
}

export function getGroupMeta(groupName?: string | null, style?: GroupStyle): GroupMeta {
  const normalized = (groupName || 'Generale').trim() || 'Generale'
  const key = `${normalized.toLowerCase()}|${style?.tone ?? ''}|${style?.icon ?? ''}`

  const cached = metaCache.get(key)
  if (cached) {
    return cached
  }

  // Bound the cache: group names are user input, so a pathological list must not
  // grow this map without limit.
  if (metaCache.size > 500) {
    metaCache.clear()
  }

  const meta = buildGroupMeta(normalized, style)
  metaCache.set(key, meta)
  return meta
}

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h += value.charCodeAt(i)
  }
  return h
}
