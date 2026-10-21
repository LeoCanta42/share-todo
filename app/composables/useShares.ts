import type { Database } from '~/types/database.types'
import type { TodoPermission, TodoShare } from '~/types/todo'
import { useGroups } from '~/composables/useGroups'

/**
 * The only fields the grant lookup needs. Both a todo and a note satisfy it, which
 * is what lets one implementation decide permissions for either kind of content.
 *
 * `group_id` is the group the item lives in; `path` is not needed here because the
 * group row itself carries it (see `useGroups`).
 */
export interface ShareableItem {
  user_id: string | null
  group_id: string | null
}

export function useShares() {
  const supabase = useSupabaseClient<Database>()
  const { userId, userEmail } = useCurrentUser()
  const { groupsById, namePath } = useGroups()
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

  /**
   * Grants indexed by owner and then by group, so the permission check for a row is a
   * couple of map lookups instead of scanning every received share per row.
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
      groups.set(share.group_id ?? '*', share.permission)
    }
    return map
  })

  /**
   * What the current user may do with one item — a todo or a note.
   *
   * A grant on a group covers its sub-groups, so the answer is the *closest* grant
   * that covers the item: its own group, then each ancestor, and only then the
   * whole-list grant. That is the same rule the RLS policy applies (there, "some
   * grant covers it"); here it is used to grey out read-only rows instead of letting
   * the user try and fail.
   *
   * `unknown` (shares not loaded yet, or an item whose group is not visible any more)
   * deliberately keeps the actions enabled — the server stays the authority.
   */
  function permissionFor(item: ShareableItem): 'edit' | 'read' | 'unknown' {
    const me = userId.value
    if (!me) return 'unknown'
    if (!item.user_id || item.user_id === me) return 'edit'

    const grants = grantsByOwner.value.get(item.user_id)
    if (!grants || grants.size === 0) return 'unknown'

    const group = item.group_id ? groupsById.value.get(item.group_id) : undefined

    if (group) {
      // path is {root, …, self}: walking it backwards visits the closest first.
      for (let i = group.path.length - 1; i >= 0; i--) {
        const grant = grants.get(group.path[i]!)
        if (grant) return grant === 'edit' ? 'edit' : 'read'
      }
    }

    const wholeList = grants.get('*')
    if (wholeList) return wholeList === 'edit' ? 'edit' : 'read'

    // A group we can no longer see is a revoked grant, not an unknown state.
    return group ? 'read' : 'unknown'
  }

  /** Human description of what a grant covers, for the sharing lists. */
  function describeScope(groupId: string | null): string {
    if (!groupId) return 'l\'intera lista'
    const group = groupsById.value.get(groupId)
    const path = group ? namePath(group.id).join('/') : 'questo gruppo'
    return `il gruppo "${path}" e i suoi sottogruppi`
  }

  async function shareList(
    email: string,
    permission: TodoPermission = 'edit',
    groupId: string | null = null
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
      share => share.shared_with_email.toLowerCase() === cleanEmail && (share.group_id ?? null) === groupId
    )
    if (existing) {
      toast.add({
        title: 'Già condiviso',
        description: `${cleanEmail} ha già accesso a ${describeScope(groupId)}.`,
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
          group_id: groupId,
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
        description: `${cleanEmail} ora può accedere a ${describeScope(groupId)}.`,
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

  /** Change what an existing grant allows. */
  async function updateSharePermission(shareId: number, permission: TodoPermission): Promise<boolean> {
    const previous = [...myShares.value]
    myShares.value = myShares.value.map(share => (share.id === shareId ? { ...share, permission } : share))

    const { data, error } = await supabase
      .from('todo_shares')
      .update({ permission })
      .eq('id', shareId)
      .select('id')

    if (error || !data || data.length === 0) {
      myShares.value = previous
      toast.add({
        title: 'Permesso non aggiornato',
        description: error?.message ?? 'La condivisione non è più accessibile.',
        color: 'error'
      })
      return false
    }

    return true
  }

  async function removeShare(shareId: number) {
    const previous = [...myShares.value]
    myShares.value = myShares.value.filter(share => share.id !== shareId)

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
    updateSharePermission,
    removeShare,
    permissionFor,
    describeScope
  }
}
