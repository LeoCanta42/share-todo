/**
 * Route guard for /admin.
 *
 * A convenience, not the security boundary: every admin operation is a
 * SECURITY DEFINER function that re-checks `is_admin(auth.uid())` server-side, so
 * reaching the page without being an admin gains nothing but an empty table.
 */
export default defineNuxtRouteMiddleware(async () => {
  const { user } = useCurrentUser()
  const { isAdmin, loaded, loadProfile } = useProfile()

  if (!user.value) {
    return navigateTo('/')
  }

  // The shell loads the profile too, but the guard may run first on a direct
  // navigation to /admin — wait for it rather than redirecting on a false negative.
  if (!loaded.value) {
    await loadProfile()
  }

  if (!isAdmin.value) {
    return navigateTo('/')
  }
})
