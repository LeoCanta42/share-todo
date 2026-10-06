import { useShareTarget } from '~/composables/useShareTarget'

/**
 * Receives content shared from another app.
 *
 * A global middleware rather than logic inside the `/share` page, because the
 * page is only rendered once the account is approved: capturing here means a
 * share that arrives while the user is signing in (or waiting for approval) is
 * still waiting for them afterwards.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/share') return

  const { content, capture } = useShareTarget()
  const captured = capture(to.query as Record<string, unknown>)
  if (captured) return

  // A bare /share — bookmarked, typed by hand, or reached after the content was
  // already filed away — has nothing to show.
  if (!content.value) {
    return navigateTo('/')
  }
})
