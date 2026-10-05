import type { JwtPayload } from '@supabase/supabase-js'

/**
 * Identity of the signed-in user.
 *
 * @nuxtjs/supabase v2 fills `useSupabaseUser()` with the **JWT claims**, where the
 * user id is `sub` — there is no `id` field. Reading `.id` yields `undefined`,
 * which silently breaks every filter built from it, e.g.
 * `shared_with_id=eq.undefined` -> Postgres `22P02: invalid input syntax for type uuid`.
 *
 * TypeScript does not catch that mistake because `JwtPayload` ends with an
 * `[key: string]: any` index signature — so the typo compiles and only fails at runtime.
 */
export function useCurrentUser() {
  const user = useSupabaseUser()

  const claims = computed<JwtPayload | null>(() => (user.value as JwtPayload | null) ?? null)

  const userId = computed<string | null>(() => claims.value?.sub ?? null)

  const userEmail = computed<string | null>(() => claims.value?.email?.toLowerCase() ?? null)

  return { user, claims, userId, userEmail }
}
