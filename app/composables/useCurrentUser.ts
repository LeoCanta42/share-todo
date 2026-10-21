import type { JwtPayload } from '@supabase/supabase-js'
import {
  getStoredLocalUser,
  setStoredLocalUser,
  type CachedSessionUser
} from '~/utils/offlineDb'

/**
 * Identity of the signed-in user.
 *
 * @nuxtjs/supabase v2 fills `useSupabaseUser()` with the **JWT claims**, where the
 * user id is `sub` — there is no `id` field. Reading `.id` yields `undefined`,
 * which silently breaks every filter built from it, e.g.
 * `shared_with_id=eq.undefined` -> Postgres `22P02: invalid input syntax for type uuid`.
 *
 * Supports offline mode by caching the session identity locally so that opening
 * the app without connection restores the user and preserves access to the last saved data.
 */
export function useCurrentUser() {
  const supabaseUser = useSupabaseUser()

  // Persistent offline/cached session user loaded synchronously from local storage
  const cachedUser = useState<CachedSessionUser | null>('offline-session-user', () => {
    if (import.meta.client) {
      return getStoredLocalUser()
    }
    return null
  })

  // Explicit logout flag: prevents resurrection of cached user after user explicitly signed out
  const isLoggedOut = useState<boolean>('auth-explicit-logged-out', () => false)

  // Sync Supabase user claims to local storage whenever a live session is active
  watch(supabaseUser, (newUser) => {
    if (newUser) {
      isLoggedOut.value = false
      const sessionUser: CachedSessionUser = {
        id: (newUser as any).sub || (newUser as any).id || '',
        sub: (newUser as any).sub || (newUser as any).id || '',
        email: (newUser as any).email || '',
        user_metadata: (newUser as any).user_metadata,
        app_metadata: (newUser as any).app_metadata,
        role: (newUser as any).role,
        aud: (newUser as any).aud,
        exp: (newUser as any).exp
      }
      cachedUser.value = sessionUser
      if (import.meta.client) {
        setStoredLocalUser(sessionUser)
      }
    }
  }, { immediate: true })

  // Effective user: live Supabase claims when available, falling back to cached user when offline
  const user = computed<any>(() => {
    if (isLoggedOut.value) return null
    if (supabaseUser.value) return supabaseUser.value
    if (cachedUser.value) return cachedUser.value
    return null
  })

  const claims = computed<JwtPayload | null>(() => (user.value as JwtPayload | null) ?? null)

  const userId = computed<string | null>(() => {
    const c = claims.value as any
    return c?.sub ?? c?.id ?? null
  })

  const userEmail = computed<string | null>(() => {
    const c = claims.value as any
    return c?.email?.toLowerCase() ?? null
  })

  function markLoggedOut() {
    isLoggedOut.value = true
    cachedUser.value = null
    if (import.meta.client) {
      setStoredLocalUser(null)
    }
  }

  function markLoggedIn(newUser: any) {
    isLoggedOut.value = false
    const sessionUser: CachedSessionUser = {
      id: newUser.sub || newUser.id || '',
      sub: newUser.sub || newUser.id || '',
      email: newUser.email || '',
      user_metadata: newUser.user_metadata,
      app_metadata: newUser.app_metadata,
      role: newUser.role,
      aud: newUser.aud,
      exp: newUser.exp
    }
    cachedUser.value = sessionUser
    if (import.meta.client) {
      setStoredLocalUser(sessionUser)
    }
  }

  return {
    user,
    claims,
    userId,
    userEmail,
    markLoggedOut,
    markLoggedIn
  }
}
