import type { Database } from '~/types/database.types'
import type { AdminUser } from '~/types/profile'

/**
 * Admin operations.
 *
 * Every call is a `supabase.rpc(...)` into a SECURITY DEFINER function that
 * re-checks `public.is_admin(auth.uid())` on the server. This composable adds the
 * toasts and the local bookkeeping — it is *not* what enforces anything, so an
 * unauthorised client that calls the RPC directly still gets a 42501 back.
 */
export function useAdmin() {
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const toast = useToast()

  const users = useState<AdminUser[]>('admin-users', () => [])
  const loading = useState<boolean>('admin-users-loading', () => false)
  const loaded = useState<boolean>('admin-users-loaded', () => false)
  /** Id of the user a mutation is currently running for, so its row can show a spinner. */
  const busyId = useState<string | null>('admin-busy-id', () => null)

  const pendingCount = computed(() => users.value.filter(u => !u.approved).length)

  const currentUserId = computed(() => userId.value)

  async function loadUsers() {
    loading.value = true
    try {
      const { data, error } = await supabase.rpc('admin_list_users')

      if (error) {
        users.value = []
        loaded.value = false
        toast.add({
          title: 'Utenti non disponibili',
          description: isPermissionError(error.message)
            ? 'Solo un amministratore può gestire gli utenti.'
            : error.message,
          color: 'error'
        })
        return
      }

      users.value = data ?? []
      loaded.value = true
    } catch (err: unknown) {
      console.error('Unexpected error loading users:', err)
    } finally {
      loading.value = false
    }
  }

  function isPermissionError(message?: string | null): boolean {
    if (!message) return false
    return message.includes('42501') || /not authorized/i.test(message)
  }

  /**
   * Shared wrapper: run an RPC, report the outcome, keep `busyId` accurate.
   * The row's flag is only flipped after the server confirms, so the table never
   * claims something the database refused.
   */
  async function run(
    target: AdminUser,
    successTitle: string,
    failureTitle: string,
    call: () => PromiseLike<{ error: { message: string } | null }>
  ): Promise<boolean> {
    if (busyId.value) return false
    busyId.value = target.id

    try {
      const { error } = await call()

      if (error) {
        toast.add({
          title: failureTitle,
          description: isPermissionError(error.message)
            ? 'Operazione non consentita.'
            : error.message,
          color: 'error'
        })
        return false
      }

      toast.add({ title: successTitle, color: 'success' })
      return true
    } catch (err: unknown) {
      console.error('Admin action failed:', err)
      toast.add({ title: failureTitle, color: 'error' })
      return false
    } finally {
      busyId.value = null
    }
  }

  async function setApproved(target: AdminUser, approved: boolean): Promise<boolean> {
    const ok = await run(
      target,
      approved ? 'Utente approvato' : 'Approvazione revocata',
      'Approvazione non aggiornata',
      () => supabase.rpc('admin_set_approved', { p_user_id: target.id, p_approved: approved })
    )
    if (ok) patch(target.id, { approved })
    return ok
  }

  async function resetPassword(target: AdminUser, password: string): Promise<boolean> {
    return run(
      target,
      'Password reimpostata',
      'Password non reimpostata',
      () => supabase.rpc('admin_set_password', { p_user_id: target.id, p_password: password })
    )
  }

  async function deleteUser(target: AdminUser): Promise<boolean> {
    const ok = await run(
      target,
      'Utente eliminato',
      'Utente non eliminato',
      () => supabase.rpc('admin_delete_user', { p_user_id: target.id })
    )
    if (ok) {
      users.value = users.value.filter(u => u.id !== target.id)
    }
    return ok
  }

  function patch(id: string, changes: Partial<AdminUser>) {
    users.value = users.value.map(u => (u.id === id ? { ...u, ...changes } : u))
  }

  /** An admin may not delete or demote themselves — the database refuses it too. */
  function isSelf(user: AdminUser): boolean {
    return Boolean(currentUserId.value && user.id === currentUserId.value)
  }

  function reset() {
    users.value = []
    loaded.value = false
    busyId.value = null
  }

  return {
    users,
    loading,
    loaded,
    busyId,
    pendingCount,
    loadUsers,
    setApproved,
    resetPassword,
    deleteUser,
    isSelf,
    reset
  }
}
