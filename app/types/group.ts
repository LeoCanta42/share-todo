import type { Database } from './database.types'

/**
 * A group is a row now, not a name repeated on every activity.
 *
 * `path` is the ancestor chain including the group itself — {root, …, self} —
 * maintained by the database. It is what makes "a grant on Lavoro also covers
 * Lavoro/Clienti" a cheap check instead of a recursive walk, both here and in the
 * RLS policies. `depth` is 1 for a top-level group.
 */
export type Group = Database['public']['Tables']['groups']['Row']
export type GroupInsert = Database['public']['Tables']['groups']['Insert']
export type GroupUpdate = Database['public']['Tables']['groups']['Update']

/** One group with its children, for pickers and the grid. */
export interface GroupNode {
  group: Group
  children: GroupNode[]
  /** 1 for a top-level group; the same as `group.depth`. */
  depth: number
}

/** Fields a group may be created with. `name` is the only required one. */
export interface NewGroup {
  name: string
  /** Parent group; omit or null for a top-level group. */
  parentId?: string | null
  tone?: string
  icon?: string
}
