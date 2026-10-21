import type { Database } from '~/types/database.types'
import type { ApprovalStatus, Profile } from '~/types/profile'

/**
 * The signed-in user's own profile: the two flags that decide whether the app is
 * usable (`approved`) and whether the admin area is reachable (`is_admin`).
 *
 * Read-only by design — `public.profiles` has no insert/update policy, so these
 * fields can only be changed by an admin through the SQL functions in
 * `supabase/schema.sql`.
 */
export function useProfile() {
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()

  const profile = useState<Profile | null>('me-profile', () => null)
  const loading = useState<boolean>('me-profile-loading', () => false)
  /** True once a fetch has settled, so callers can tell "pending" from "not asked yet". */
  const loaded = useState<boolean>('me-profile-loaded', () => false)

  const isAdmin = computed(() => Boolean(profile.value?.is_admin))

  const status = computed<ApprovalStatus>(() => {
    if (!loaded.value) return 'unknown'
    // A missing row must not soft-lock the account. `profiles` is filled by a
    // trigger on signup and backfilled by schema.sql, so an absent row means the
    // row was never created — not that the user was refused. The database remains
    // the authority on what the account may read, so the UI fails open here.
    if (!profile.value) return 'approved'
    return profile.value.approved ? 'approved' : 'pending'
  })

  const isApproved = computed(() => status.value !== 'pending')

  async function loadProfile() {
    const id = userId.value
    if (!id) {
      profile.value = null
      loaded.value = false
      return
    }

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        console.error('Error loading profile:', error)
        profile.value = null
      } else {
        profile.value = data ?? null
      }
      loaded.value = true
    } catch (err: unknown) {
      console.error('Unexpected error loading profile:', err)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** Re-read the flags — used by the waiting screen after an admin approves. */
  function refreshProfile(): Promise<void> {
    return loadProfile()
  }

  function resetProfile() {
    profile.value = null
    loaded.value = false
  }

  return {
    profile,
    loading,
    loaded,
    isAdmin,
    isApproved,
    status,
    loadProfile,
    refreshProfile,
    resetProfile
  }
}
