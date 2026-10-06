import type { Database } from './database.types'
import type { Group } from './group'

export type Note = Database['public']['Tables']['notes']['Row']
export type NoteInsert = Database['public']['Tables']['notes']['Insert']
export type NoteUpdate = Database['public']['Tables']['notes']['Update']

/**
 * A note as the app reads it: the row plus its group, embedded by the query
 * (`select('*, group:groups(…)')`). `group` is null when the group is not readable —
 * a revoked grant, or a group that was deleted — and the row's mirrored `group_name`
 * is then what the UI shows.
 */
export type NoteWithGroup = Note & { group: Group | null }
