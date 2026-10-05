/**
 * Compact, human date helpers used by the list and the reading modal.
 */

function parse(dateString?: string | null): Date | null {
  if (!dateString) return null
  const date = new Date(dateString)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Whole days between two dates, ignoring the time of day. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

/**
 * Short relative label for a list row: "Proprio ora", "12m fa", "Ieri", "3 gg fa",
 * the clock time for today, the date for anything older.
 */
export function formatDate(dateString?: string | null): string {
  const date = parse(dateString)
  if (!date) return ''

  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60_000)

  if (diffMinutes < 0) {
    return formatFullDate(dateString)
  }
  if (diffMinutes < 1) return 'Proprio ora'
  if (diffMinutes < 60) return `${diffMinutes}m fa`

  const days = daysBetween(date, now)
  if (days === 0) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  }
  if (days === 1) return 'Ieri'
  if (days < 7) return `${days} gg fa`

  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  })
}

/** Long, unambiguous label for the reading modal: "mercoledì 5 ottobre 2025, 18:22". */
export function formatFullDate(dateString?: string | null): string {
  const date = parse(dateString)
  if (!date) return ''

  const day = date.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${time}`
}

/** "12 ott" style label used in group headers. */
export function formatShortDate(dateString?: string | null): string {
  const date = parse(dateString)
  if (!date) return ''
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
