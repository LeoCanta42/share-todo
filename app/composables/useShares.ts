import type { Database } from '~/types/database.types'
import type { TodoPermission, TodoShare } from '~/types/todo'
import type { Todo } from '~/types/todo'

export function useShares() {
  const supabase = useSupabaseClient<Database>()
  const { userId, userEmail } = useCurrentUser()
  const toast = useToast()

  const myShares = useState<TodoShare[]>('todo-my-shares', () => [])
  const receivedShares = useState<TodoShare[]>('todo-received-shares', () => [])
  const loading = useState<boolean>('todo-shares-loading', () => false)
  const isSharing = useState<boolean>('todo-is-sharing', () => false)

  async function loadShares() {
    const id = userId.value
    if (!id) return

    loading.value = true
    try {
      // Shares received by me. Match on the resolved user id, and fall back to
      // the email for invitations sent before the recipient had an account.
      const email = userEmail.value
      const recipientFilters = [`shared_with_id.eq.${id}`]
      if (email) {
        recipientFilters.push(`shared_with_email.ilike.${email}`)
      }

      // Both queries run together: they used to be sequential, which doubled the
      // wait before the sharing panel had anything to show.
      const [mine, received] = await Promise.all([
        supabase
          .from('todo_shares')
          .select('*')
          .eq('owner_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('todo_shares')
          .select('*')
          .or(recipientFilters.join(','))
          .neq('owner_id', id)
      ])

      if (mine.error) {
        console.error('Error loading my shares:', mine.error)
      } else {
        myShares.value = mine.data ?? []
      }

      if (received.error) {
        console.error('Error loading received shares:', received.error)
      } else {
        receivedShares.value = received.data ?? []
      }
    } catch (err: unknown) {
      console.error('Unexpected error loading shares:', err)
    } finally {
      loading.value = false
    }
  }

  function describeScope(groupName: string | null): string {
    return groupName ? `il gruppo "${groupName}"` : 'l\'intera lista'
  }

  /**
   * Grants indexed by owner and group, so the permission check for a row is two map
   * lookups instead of scanning every received share per row per render.
   * `*` stands for a whole-list grant.
   */
  const grantsByOwner = computed<Map<string, Map<string, TodoPermission>>>(() => {
    const map = new Map<string, Map<string, TodoPermission>>()
    for (const share of receivedShares.value) {
      const owner = share.owner_id
      if (!owner) continue

      let groups = map.get(owner)
      if (!groups) {
        groups = new Map<string, TodoPermission>()
        map.set(owner, groups)
      }
      groups.set(share.group_name ?? '*', share.permission)
    }
    return map
  })

  /**
   * What the current user may do with one activity.
   *
   * Received shares are already loaded, so the UI can grey out read-only rows
   * instead of letting the user try and fail against RLS. `unknown` (shares not
   * loaded yet, or an activity shared some other way) deliberately keeps the
   * actions enabled — the server stays the authority.
   */
  function todoPermission(todo: Todo): 'edit' | 'read' | 'unknown' {
    const me = userId.value
    if (!me) return 'unknown'
    if (!todo.user_id || todo.user_id === me) return 'edit'

    const grants = grantsByOwner.value.get(todo.user_id)
    if (!grants) return 'unknown'

    // A group-specific grant wins over a whole-list grant.
    const grant = grants.get(todo.group_name ?? 'Generale') ?? grants.get('*')
    if (!grant) return 'read'

    return grant === 'edit' ? 'edit' : 'read'
  }

  async function shareList(
    email: string,
    permission: TodoPermission = 'edit',
    groupName: string | null = null
  ): Promise<boolean> {
    const id = userId.value
    if (!id) {
      toast.add({
        title: 'Accesso richiesto',
        description: 'Devi effettuare il login per condividere.',
        color: 'error'
      })
      return false
    }

    const cleanEmail = email.trim().toLowerCase()
    const group = groupName?.trim() || null
    if (!cleanEmail) return false

    if (cleanEmail === userEmail.value) {
      toast.add({
        title: 'Operazione non valida',
        description: 'Non puoi condividere le attività con la tua stessa email.',
        color: 'warning'
      })
      return false
    }

    // One row per (person, group): the same person can receive several groups.
    const existing = myShares.value.find(
      s => s.shared_with_email.toLowerCase() === cleanEmail && (s.group_name ?? null) === group
    )
    if (existing) {
      toast.add({
        title: 'Già condiviso',
        description: `${cleanEmail} ha già accesso a ${describeScope(group)}.`,
        color: 'info'
      })
      return false
    }

    isSharing.value = true
    try {
      const { data, error } = await supabase
        .from('todo_shares')
        .insert({
          owner_id: id,
          shared_with_email: cleanEmail,
          group_name: group,
          permission
        })
        .select()
        .single()

      if (error) {
        toast.add({
          title: 'Errore di condivisione',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (data) {
        myShares.value = [data, ...myShares.value]
      } else {
        await loadShares()
      }

      toast.add({
        title: 'Invito inviato',
        description: `${cleanEmail} ora può accedere a ${describeScope(group)}.`,
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      console.error('Share error:', err)
      return false
    } finally {
      isSharing.value = false
    }
  }

  async function removeShare(shareId: number) {
    const previous = [...myShares.value]
    myShares.value = myShares.value.filter(s => s.id !== shareId)

    try {
      const { data, error } = await supabase
        .from('todo_shares')
        .delete()
        .eq('id', shareId)
        .select('id')

      // A policy can filter the row out without raising: an empty result means
      // nothing was actually revoked, so put it back.
      if (error || !data || data.length === 0) {
        myShares.value = previous
        toast.add({
          title: 'Errore rimozione condivisione',
          description: error?.message ?? 'La condivisione non è stata rimossa.',
          color: 'error'
        })
      } else {
        toast.add({
          title: 'Condivisione revocata',
          color: 'neutral'
        })
      }
    } catch (err: unknown) {
      myShares.value = previous
      console.error('Error removing share:', err)
    }
  }

  return {
    myShares,
    receivedShares,
    loading,
    isSharing,
    loadShares,
    shareList,
    removeShare,
    todoPermission
  }
}
