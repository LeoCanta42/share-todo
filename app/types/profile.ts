import type { Database } from './database.types'

/** The signed-in user's own row in `public.profiles`. */
export type Profile = Database['public']['Tables']['profiles']['Row']

/** One row of the admin panel: a profile joined with auth metadata and counts. */
export type AdminUser = Database['public']['Functions']['admin_list_users']['Returns'][number]

/**
 * Whether the app may be used. `unknown` is the state before the profile has been
 * fetched — the pages must wait rather than guess, because guessing "pending" would
 * flash the waiting screen at every signed-in user on each full page load.
 */
export type ApprovalStatus = 'unknown' | 'pending' | 'approved'
