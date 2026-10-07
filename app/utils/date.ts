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

/**
 * Long, unambiguous label for the reading modal: "mercoledì 5 ottobre 2025, 18:22".
 */
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

/** "12 ott" style label used in group headers and chips. */
export function formatShortDate(dateString?: string | null): string {
  const date = parse(dateString)
  if (!date) return ''
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later'

/**
 * Determines the urgency bucket of a due date. Pure function for predictable testing.
 */
export function dueBucket(
  dueAtString?: string | null,
  allDay = false,
  now = new Date()
): DueBucket | null {
  const date = parse(dueAtString)
  if (!date) return null

  const nowDayStart = startOfDay(now)
  const dateDayStart = startOfDay(date)
  const diffDays = Math.round((dateDayStart - nowDayStart) / 86_400_000)

  if (allDay) {
    if (diffDays < 0) return 'overdue'
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'tomorrow'
    if (diffDays <= 7) return 'soon'
    return 'later'
  }

  // Timed activity
  if (date.getTime() < now.getTime()) {
    return 'overdue'
  }

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays <= 7) return 'soon'
  return 'later'
}

/**
 * Human-friendly due label for list chips and detail modals: "Oggi 18:00", "Domani", "In ritardo", "5 ott".
 */
export function dueLabel(
  dueAtString?: string | null,
  allDay = false,
  now = new Date()
): string {
  const date = parse(dueAtString)
  if (!date) return ''

  const bucket = dueBucket(dueAtString, allDay, now)
  if (!bucket) return ''

  const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const sameYear = date.getFullYear() === now.getFullYear()

  if (bucket === 'overdue') {
    const daysLate = daysBetween(date, now)
    if (allDay) {
      if (daysLate === 1) return 'Scaduta ieri'
      return `Scaduta (${formatShortDate(dueAtString)})`
    }
    if (daysLate === 0) return `Scaduta alle ${timeStr}`
    if (daysLate === 1) return `Scaduta ieri ${timeStr}`
    return `Scaduta (${formatShortDate(dueAtString)} ${timeStr})`
  }

  if (bucket === 'today') {
    return allDay ? 'Oggi' : `Oggi ${timeStr}`
  }

  if (bucket === 'tomorrow') {
    return allDay ? 'Domani' : `Domani ${timeStr}`
  }

  if (bucket === 'soon') {
    const weekday = date.toLocaleDateString('it-IT', { weekday: 'short' })
    const formattedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
    return allDay ? formattedWeekday : `${formattedWeekday} ${timeStr}`
  }

  // later
  const dateStr = date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  })
  return allDay ? dateStr : `${dateStr} ${timeStr}`
}

/** Converts a Date to YYYY-MM-DD for native <input type="date"> */
export function toInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Converts a Date to HH:mm for native <input type="time"> */
export function toInputTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** Builds an ISO UTC string from local YYYY-MM-DD and optional HH:mm */
export function buildIsoDueAt(dateStr: string, timeStr?: string | null, allDay = false): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (!year || !month || !day) return ''

  if (allDay || !timeStr) {
    // Midnight in device local time
    const localDate = new Date(year, month - 1, day, 0, 0, 0, 0)
    return localDate.toISOString()
  }

  const [hours, minutes] = timeStr.split(':').map(Number)
  const localDate = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0)
  return localDate.toISOString()
}

