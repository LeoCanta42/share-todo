export interface GroupMeta {
  name: string
  colorClass: string
  badgeColor: 'neutral' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error'
  icon: string
}

export const DEFAULT_GROUPS: GroupMeta[] = [
  { name: 'Generale', colorClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', badgeColor: 'neutral', icon: 'i-lucide-folder' },
  { name: 'Lavoro', colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300', badgeColor: 'info', icon: 'i-lucide-briefcase' },
  { name: 'Casa', colorClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300', badgeColor: 'secondary', icon: 'i-lucide-home' },
  { name: 'Spesa', colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300', badgeColor: 'warning', icon: 'i-lucide-shopping-cart' },
  { name: 'Studio', colorClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300', badgeColor: 'success', icon: 'i-lucide-book-open' },
  { name: 'Progetto', colorClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300', badgeColor: 'error', icon: 'i-lucide-target' },
]

export function getGroupMeta(groupName?: string | null): GroupMeta {
  const normalized = (groupName || 'Generale').trim()
  const found = DEFAULT_GROUPS.find(g => g.name.toLowerCase() === normalized.toLowerCase())
  if (found) {
    return found
  }

  // Deterministic color palette for custom subgroups
  const palette: Array<{ colorClass: string; badgeColor: GroupMeta['badgeColor'] }> = [
    { colorClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300', badgeColor: 'info' },
    { colorClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', badgeColor: 'secondary' },
    { colorClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', badgeColor: 'warning' },
    { colorClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300', badgeColor: 'success' },
    { colorClass: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300', badgeColor: 'error' },
  ]

  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash + normalized.charCodeAt(i)) % palette.length
  }

  const chosen = palette[hash] ?? palette[0]!

  return {
    name: normalized,
    colorClass: chosen.colorClass,
    badgeColor: chosen.badgeColor,
    icon: 'i-lucide-tag'
  }
}
