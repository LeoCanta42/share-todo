import type { JwtPayload } from '@supabase/supabase-js'
import { offlineStorage } from '~/utils/offlineStorage'

/**
 * Identity of the signed-in user.
 *
 * @nuxtjs/supabase v2 fills `useSupabaseUser()` with the **JWT claims**, where the
 * user id is `sub` — there is no `id` field. Reading `.id` yields `undefined`.
 *
 * In offline mode or when network fails, this composable falls back to the
 * locally cached user session so the user remains authenticated offline.
 */
export function useCurrentUser() {
  const rawSupabaseUser = useSupabaseUser()

  const offlineUserState = useState<JwtPayload | null>('offline-user-state', () => {
    if (import.meta.client && !offlineStorage.isLoggedOut()) {
      return offlineStorage.getUser()
    }
    return null
  })

  // Hydrate client-side if needed
  if (import.meta.client && !offlineStorage.isLoggedOut() && !offlineUserState.value) {
    const cached = offlineStorage.getUser()
    if (cached) {
      offlineUserState.value = cached
    }
  }

  // If Supabase user claims are present, update cache
  if (rawSupabaseUser.value) {
    offlineUserState.value = rawSupabaseUser.value as JwtPayload
    offlineStorage.setUser(rawSupabaseUser.value as JwtPayload)
  } else if (offlineUserState.value && !offlineStorage.isLoggedOut()) {
    // Keep useSupabaseUser populated so any external plugins/composables see the user
    rawSupabaseUser.value = offlineUserState.value
  }

  const activeUser = computed<JwtPayload | null>(() => {
    if (rawSupabaseUser.value) return rawSupabaseUser.value as JwtPayload
    if (!offlineStorage.isLoggedOut()) {
      return offlineUserState.value
    }
    return null
  })

  const claims = computed<JwtPayload | null>(() => activeUser.value)
  const userId = computed<string | null>(() => claims.value?.sub ?? null)
  const userEmail = computed<string | null>(() => claims.value?.email?.toLowerCase() ?? null)

  return { user: activeUser, claims, userId, userEmail, rawUser: rawSupabaseUser }
}
