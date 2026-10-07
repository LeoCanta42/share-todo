import type { Database } from './database.types'
import type { Group } from './group'

export type Todo = Database['public']['Tables']['todos']['Row']
export type TodoInsert = Database['public']['Tables']['todos']['Insert']
export type TodoUpdate = Database['public']['Tables']['todos']['Update']

export type TodoShare = Database['public']['Tables']['todo_shares']['Row']
export type TodoShareInsert = Database['public']['Tables']['todo_shares']['Insert']
export type TodoShareUpdate = Database['public']['Tables']['todo_shares']['Update']

export type TodoPermission = TodoShare['permission']

export type TodoFilter = 'all' | 'active' | 'completed' | 'due'
export type TodoScope = 'all' | 'mine' | 'shared'

export interface TodoDueOptions {
  dueAt?: string | null
  dueAllDay?: boolean
  reminderMinutes?: number | null
  timezone?: string | null
}

/** The selection used by the list and the group page: one group, or everything. */
export type TodoGroupSelection = 'all' | (string & {})

export interface TodoStats {
  total: number
  active: number
  completed: number
  percentage: number
  overdue: number
  dueToday: number
}

/**
 * An activity as the app reads it: the row plus its group, embedded by the query
 * (`select('*, group:groups(…)')`). `group` is null when the group is not readable —
 * a revoked grant, or a group that was deleted — and the row's mirrored `group_name`
 * is then what the UI shows.
 */
export type TodoWithGroup = Todo & { group: Group | null }

/** Per-group tallies: the group's own activities, and its whole sub-tree. */
export interface GroupCounts {
  own: TodoStats
  total: TodoStats
}
