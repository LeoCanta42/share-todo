import type { Database } from '~/types/database.types'
import type { Todo, TodoFilter, TodoScope, TodoStats, TodoWithGroup, GroupCounts, TodoDueOptions } from '~/types/todo'
import { usePreferences, type SortOrder } from '~/composables/usePreferences'
import { useGroups } from '~/composables/useGroups'
import { dueBucket } from '~/utils/date'
import { offlineStorage } from '~/utils/offlineStorage'
import { useOfflineSync } from '~/composables/useOfflineSync'
import { isNetworkError } from '~/utils/network'

export interface TodoSection {
  /** Group id, or '' for the implicit bucket a row without a group falls into. */
  groupId: string
  name: string
  todos: TodoWithGroup[]
}

/** The columns the list needs from an embedded group. */
const GROUP_COLUMNS = 'id, name, parent_id, path, depth, tone, icon'

function emptyStats(): TodoStats {
  return { total: 0, active: 0, completed: 0, percentage: 0, overdue: 0, dueToday: 0 }
}

/**
 * Activities.
 *
 * An activity lives in a group *row* (`group_id`), not in a name: that is what makes
 * sub-groups possible. Everything the list needs is derived from the group's `path`.
 *
 * Fully supports offline mode: local caching, offline creation/edits/deletions,
 * and automatic synchronization with Supabase when online.
 */
export function useTodos() {
  const supabase = useNuxtApp().$supabase?.client as ReturnType<typeof useSupabaseClient<Database>> | undefined
    ?? useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const { prefs } = usePreferences()
  const { groupsById, namePath } = useGroups()
  const { enqueueMutation, removeMutationsForTempId } = useOfflineSync()
  const toast = useToast()

  const initialTodos = import.meta.client && !offlineStorage.isLoggedOut()
    ? offlineStorage.getTodos()
    : []

  const todos = useState<TodoWithGroup[]>('todos-list', () => initialTodos)
  const loading = useState<boolean>('todos-loading', () => false)
  const isAdding = useState<boolean>('todos-is-adding', () => false)
  const activeActionId = useState<number | null>('todos-active-id', () => null)

  const filter = useState<TodoFilter>('todos-filter', () => 'all')
  const scope = useState<TodoScope>('todos-scope', () => 'all')
  /** 'all', or the id of the group being shown (the group page pushes it). */
  const selectedGroupId = useState<string>('todos-selected-group-id', () => 'all')
  const searchQuery = useState<string>('todos-search', () => '')

  // Hydrate client-side if needed
  if (import.meta.client && !offlineStorage.isLoggedOut() && todos.value.length === 0) {
    const cached = offlineStorage.getTodos()
    if (cached.length > 0) {
      todos.value = cached
    }
  }

  async function loadTodos() {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = offlineStorage.getTodos()
      if (cached.length > 0) {
        todos.value = cached
      }
      return
    }

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('todos')
        .select(`*, group:groups(${GROUP_COLUMNS})`)
        .order('created_at', { ascending: false }) as unknown as {
          data: TodoWithGroup[] | null
          error: { message: string } | null
        }

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching todos:', error)
          toast.add({
            title: 'Errore nel caricamento',
            description: error.message || 'Impossibile caricare i task',
            color: 'error'
          })
        }
        const cached = offlineStorage.getTodos()
        if (cached.length > 0) {
          todos.value = cached
        }
        return
      }

      // Preserve any local temp todos not yet synced
      const tempTodos = todos.value.filter(t => t.id < 0)
      const serverTodos = data ?? []
      todos.value = [...tempTodos, ...serverTodos.filter(st => !tempTodos.some(tt => tt.id === st.id))]
      offlineStorage.setTodos(todos.value)
    } catch (err: unknown) {
      if (!isNetworkError(err)) {
        console.error('Unexpected error loading todos:', err)
      }
      const cached = offlineStorage.getTodos()
      if (cached.length > 0) {
        todos.value = cached
      }
    } finally {
      loading.value = false
    }
  }

  function patch(id: number, changes: Partial<TodoWithGroup>) {
    todos.value = todos.value.map(todo => (todo.id === id ? { ...todo, ...changes } : todo))
  }

  function restore(id: number, snapshot: TodoWithGroup | undefined) {
    if (snapshot) {
      todos.value = todos.value.map(todo => (todo.id === id ? snapshot : todo))
    }
  }

  function notPermitted(action: string) {
    toast.add({
      title: 'Modifica non consentita',
      description: `${action}: l'attività è condivisa in sola lettura oppure non è più accessibile.`,
      color: 'warning'
    })
  }

  /** Name of the group a row sits in, falling back to the mirrored column. */
  function groupNameOf(todo: TodoWithGroup): string {
    return (todo.group?.name || todo.group_name || 'Generale').trim() || 'Generale'
  }

  function addOfflineTodo(
    title: string,
    groupId?: string | null,
    dueOptions?: TodoDueOptions
  ): boolean {
    const tempId = -Date.now()
    const targetGroup = groupId ? groupsById.value.get(groupId) : null

    const payload: Database['public']['Tables']['todos']['Insert'] = {
      title,
      group_id: groupId ?? null,
      completed: false,
      due_at: dueOptions?.dueAt ?? null,
      due_all_day: dueOptions?.dueAllDay ?? false,
      reminder_minutes: dueOptions?.reminderMinutes ?? null,
      reminder_at: dueOptions?.reminderAt ?? null,
      timezone: dueOptions?.timezone ?? (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC')
    }

    if (userId.value) {
      payload.user_id = userId.value
    }

    const tempTodo: TodoWithGroup = {
      id: tempId,
      title,
      group_id: groupId ?? null,
      group_name: targetGroup ? targetGroup.name : 'Generale',
      group: targetGroup ? {
        id: targetGroup.id,
        name: targetGroup.name,
        parent_id: targetGroup.parent_id,
        path: targetGroup.path,
        depth: targetGroup.depth,
        tone: targetGroup.tone,
        icon: targetGroup.icon
      } : null,
      completed: false,
      due_at: payload.due_at ?? null,
      due_all_day: payload.due_all_day ?? false,
      reminder_minutes: payload.reminder_minutes ?? null,
      reminder_at: payload.reminder_at ?? null,
      reminder_sent_at: null,
      timezone: payload.timezone ?? 'UTC',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: userId.value
    }

    todos.value = [tempTodo, ...todos.value.filter(todo => todo.id !== tempId)]
    offlineStorage.setTodos(todos.value)

    enqueueMutation({
      type: 'todo:insert',
      tempId,
      payload
    })

    toast.add({
      title: 'Attività creata (offline)',
      description: `"${title}" salvata localmente. Verrà sincronizzata online.`,
      color: 'info'
    })

    return true
  }

  async function addTodo(
    rawTitle: string,
    groupId?: string | null,
    dueOptions?: TodoDueOptions
  ): Promise<boolean> {
    const title = rawTitle.trim()
    if (!title) return false

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      return addOfflineTodo(title, groupId, dueOptions)
    }

    isAdding.value = true
    try {
      const payload: Database['public']['Tables']['todos']['Insert'] = {
        title,
        group_id: groupId ?? null,
        completed: false,
        due_at: dueOptions?.dueAt ?? null,
        due_all_day: dueOptions?.dueAllDay ?? false,
        reminder_minutes: dueOptions?.reminderMinutes ?? null,
        reminder_at: dueOptions?.reminderAt ?? null,
        timezone: dueOptions?.timezone ?? (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC')
      }

      if (userId.value) {
        payload.user_id = userId.value
      }

      let insertResult = await supabase
        .from('todos')
        .insert(payload)
        .select(`*, group:groups(${GROUP_COLUMNS})`)
        .single() as unknown as {
          data: TodoWithGroup | null
          error: { message: string; code?: string } | null
        }

      if (insertResult.error && (insertResult.error.message.includes('reminder_at') || insertResult.error.code === 'PGRST204')) {
        delete (payload as any).reminder_at
        if (!payload.due_at && dueOptions?.reminderAt) {
          payload.due_at = dueOptions.reminderAt
          payload.reminder_minutes = 0
        }
        insertResult = await supabase
          .from('todos')
          .insert(payload)
          .select(`*, group:groups(${GROUP_COLUMNS})`)
          .single() as unknown as {
            data: TodoWithGroup | null
            error: { message: string; code?: string } | null
          }
      }

      const { data, error } = insertResult

      if (error) {
        if (isNetworkError(error)) {
          return addOfflineTodo(title, groupId, dueOptions)
        }
        toast.add({
          title: 'Errore inserimento',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (data) {
        todos.value = [data, ...todos.value.filter(todo => todo.id !== data.id)]
        offlineStorage.setTodos(todos.value)
      } else {
        await loadTodos()
      }

      toast.add({
        title: 'Attività creata',
        description: `"${title}" aggiunta in "${data ? groupNameOf(data) : 'Generale'}"`,
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        return addOfflineTodo(title, groupId, dueOptions)
      }
      console.error('Error adding todo:', err)
      return false
    } finally {
      isAdding.value = false
    }
  }

  async function toggleTodo(todo: TodoWithGroup) {
    const snapshot = { ...todo }
    const nextCompleted = !todo.completed

    // Optimistic local update
    patch(todo.id, { completed: nextCompleted })
    offlineStorage.setTodos(todos.value)

    if (todo.id < 0 || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'todo:update',
        targetId: todo.id,
        payload: { completed: nextCompleted }
      })
      return
    }

    activeActionId.value = todo.id
    try {
      const { data, error } = await supabase
        .from('todos')
        .update({ completed: nextCompleted })
        .eq('id', todo.id)
        .select('id')

      if (error) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'todo:update',
            targetId: todo.id,
            payload: { completed: nextCompleted }
          })
          return
        }
        restore(todo.id, snapshot)
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Errore aggiornamento',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        restore(todo.id, snapshot)
        offlineStorage.setTodos(todos.value)
        notPermitted('Spunta non salvata')
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'todo:update',
          targetId: todo.id,
          payload: { completed: nextCompleted }
        })
        return
      }
      console.error('Error toggling todo:', err)
      restore(todo.id, snapshot)
      offlineStorage.setTodos(todos.value)
    } finally {
      activeActionId.value = null
    }
  }

  async function toggleTodos(targetTodos: TodoWithGroup[], forceCompleted?: boolean) {
    if (!targetTodos.length) return

    const allCompleted = targetTodos.every(todo => todo.completed)
    const nextCompleted = forceCompleted !== undefined ? forceCompleted : !allCompleted

    const toChange = targetTodos.filter(todo => Boolean(todo.completed) !== nextCompleted)
    if (toChange.length === 0) return

    const ids = toChange.map(t => t.id)
    const snapshots = new Map(toChange.map(t => [t.id, { ...t }]))

    // Optimistic local update
    todos.value = todos.value.map(todo => {
      if (snapshots.has(todo.id)) {
        return { ...todo, completed: nextCompleted }
      }
      return todo
    })
    offlineStorage.setTodos(todos.value)

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      for (const id of ids) {
        enqueueMutation({
          type: 'todo:update',
          targetId: id,
          payload: { completed: nextCompleted }
        })
      }
      toast.add({
        title: nextCompleted ? 'Tutte completate (offline)' : 'Tutte da fare (offline)',
        color: 'info'
      })
      return
    }

    try {
      const realIds = ids.filter(id => id > 0)
      const tempIds = ids.filter(id => id < 0)

      for (const tempId of tempIds) {
        enqueueMutation({
          type: 'todo:update',
          targetId: tempId,
          payload: { completed: nextCompleted }
        })
      }

      if (realIds.length === 0) return

      const { data, error } = await supabase
        .from('todos')
        .update({ completed: nextCompleted })
        .in('id', realIds)
        .select('id')

      if (error) {
        if (isNetworkError(error)) {
          for (const id of realIds) {
            enqueueMutation({
              type: 'todo:update',
              targetId: id,
              payload: { completed: nextCompleted }
            })
          }
          return
        }
        todos.value = todos.value.map(todo => snapshots.get(todo.id) ?? todo)
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Errore aggiornamento',
          description: error.message,
          color: 'error'
        })
        return
      }

      const updatedIds = new Set((data ?? []).map(row => row.id))
      if (updatedIds.size < realIds.length) {
        // Restore items that were not updated due to permissions
        todos.value = todos.value.map(todo => {
          if (snapshots.has(todo.id) && !updatedIds.has(todo.id) && todo.id > 0) {
            return snapshots.get(todo.id)!
          }
          return todo
        })
        offlineStorage.setTodos(todos.value)

        if (updatedIds.size === 0) {
          notPermitted('Spunta non salvata')
          return
        }

        toast.add({
          title: 'Aggiornamento parziale',
          description: `${updatedIds.size} di ${realIds.length} attività aggiornate: le altre sono in sola lettura.`,
          color: 'warning'
        })
      } else {
        toast.add({
          title: nextCompleted ? 'Tutte completate' : 'Tutte da fare',
          description: `${ids.length} ${ids.length === 1 ? 'attività' : 'attività'} ${nextCompleted ? 'segnata come completata' : 'riportata da fare'}.`,
          color: 'success'
        })
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        for (const id of ids) {
          enqueueMutation({
            type: 'todo:update',
            targetId: id,
            payload: { completed: nextCompleted }
          })
        }
        return
      }
      console.error('Error toggling todos:', err)
      todos.value = todos.value.map(todo => snapshots.get(todo.id) ?? todo)
      offlineStorage.setTodos(todos.value)
    }
  }

  async function updateTodoTitle(id: number, newTitle: string) {
    const trimmed = newTitle.trim()
    if (!trimmed) return

    const snapshot = todos.value.find(todo => todo.id === id)
    if (!snapshot || snapshot.title === trimmed) return

    patch(id, { title: trimmed })
    offlineStorage.setTodos(todos.value)

    if (id < 0 || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'todo:update',
        targetId: id,
        payload: { title: trimmed }
      })
      toast.add({
        title: 'Attività modificata (offline)',
        color: 'info'
      })
      return
    }

    activeActionId.value = id
    try {
      const { data, error } = await supabase
        .from('todos')
        .update({ title: trimmed })
        .eq('id', id)
        .select('id')

      if (error) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'todo:update',
            targetId: id,
            payload: { title: trimmed }
          })
          toast.add({
            title: 'Attività modificata (offline)',
            color: 'info'
          })
          return
        }
        restore(id, snapshot)
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Errore modifica',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        restore(id, snapshot)
        offlineStorage.setTodos(todos.value)
        notPermitted('Titolo non salvato')
      } else {
        toast.add({
          title: 'Attività modificata',
          color: 'success'
        })
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'todo:update',
          targetId: id,
          payload: { title: trimmed }
        })
        toast.add({
          title: 'Attività modificata (offline)',
          color: 'info'
        })
        return
      }
      console.error('Error updating title:', err)
      restore(id, snapshot)
      offlineStorage.setTodos(todos.value)
    } finally {
      activeActionId.value = null
    }
  }

  async function updateTodoGroup(id: number, groupId: string | null) {
    const snapshot = todos.value.find(todo => todo.id === id)
    if (!snapshot || (snapshot.group_id ?? null) === (groupId ?? null)) return

    const targetGroup = groupId ? groupsById.value.get(groupId) : null
    const changes: Partial<TodoWithGroup> = {
      group_id: groupId,
      group_name: targetGroup ? targetGroup.name : 'Generale',
      group: targetGroup ? {
        id: targetGroup.id,
        name: targetGroup.name,
        parent_id: targetGroup.parent_id,
        path: targetGroup.path,
        depth: targetGroup.depth,
        tone: targetGroup.tone,
        icon: targetGroup.icon
      } : null
    }

    patch(id, changes)
    offlineStorage.setTodos(todos.value)

    if (id < 0 || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'todo:update',
        targetId: id,
        payload: { group_id: groupId }
      })
      toast.add({
        title: 'Gruppo aggiornato (offline)',
        description: `Spostato in "${targetGroup ? targetGroup.name : 'Generale'}"`,
        color: 'info'
      })
      return
    }

    activeActionId.value = id
    try {
      const { data, error } = await supabase
        .from('todos')
        .update({ group_id: groupId })
        .eq('id', id)
        .select(`*, group:groups(${GROUP_COLUMNS})`) as unknown as {
          data: TodoWithGroup[] | null
          error: { message: string } | null
        }

      if (error) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'todo:update',
            targetId: id,
            payload: { group_id: groupId }
          })
          toast.add({
            title: 'Gruppo aggiornato (offline)',
            description: `Spostato in "${targetGroup ? targetGroup.name : 'Generale'}"`,
            color: 'info'
          })
          return
        }
        restore(id, snapshot)
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Errore spostamento',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        restore(id, snapshot)
        offlineStorage.setTodos(todos.value)
        notPermitted('Spostamento non salvato')
      } else {
        patch(id, data[0]!)
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Gruppo aggiornato',
          description: `Spostato in "${groupNameOf(data[0]!)}"`,
          color: 'success'
        })
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'todo:update',
          targetId: id,
          payload: { group_id: groupId }
        })
        return
      }
      console.error('Error updating group:', err)
      restore(id, snapshot)
      offlineStorage.setTodos(todos.value)
    } finally {
      activeActionId.value = null
    }
  }

  async function updateTodoDueDate(id: number, dueOptions: TodoDueOptions): Promise<boolean> {
    const snapshot = todos.value.find(todo => todo.id === id)
    if (!snapshot) return false

    const changes: Record<string, any> = {
      due_at: dueOptions.dueAt ?? null,
      due_all_day: dueOptions.dueAllDay ?? false,
      reminder_minutes: dueOptions.reminderMinutes ?? null,
      reminder_at: dueOptions.reminderAt ?? null,
      reminder_sent_at: null,
      timezone: dueOptions.timezone ?? (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC')
    }

    patch(id, changes)
    offlineStorage.setTodos(todos.value)

    if (id < 0 || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'todo:update',
        targetId: id,
        payload: changes
      })
      toast.add({
        title: 'Promemoria salvato (offline)',
        color: 'info'
      })
      return true
    }

    activeActionId.value = id

    try {
      let { data, error } = await supabase
        .from('todos')
        .update(changes)
        .eq('id', id)
        .select('id')

      if (error && (error.message.includes('reminder_at') || (error as any).code === 'PGRST204')) {
        delete changes.reminder_at
        if (!changes.due_at && dueOptions.reminderAt) {
          changes.due_at = dueOptions.reminderAt
          changes.reminder_minutes = 0
        }
        patch(id, changes)
        offlineStorage.setTodos(todos.value)
        const retry = await supabase
          .from('todos')
          .update(changes)
          .eq('id', id)
          .select('id')
        data = retry.data
        error = retry.error
      }

      if (error) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'todo:update',
            targetId: id,
            payload: changes
          })
          toast.add({
            title: 'Promemoria salvato (offline)',
            color: 'info'
          })
          return true
        }
        restore(id, snapshot)
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Errore scadenza o promemoria',
          description: error.message,
          color: 'error'
        })
        return false
      } else if (!data || data.length === 0) {
        restore(id, snapshot)
        offlineStorage.setTodos(todos.value)
        notPermitted('Modifiche non salvate')
        return false
      } else {
        toast.add({
          title: 'Promemoria salvato',
          color: 'success'
        })
        return true
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'todo:update',
          targetId: id,
          payload: changes
        })
        toast.add({
          title: 'Promemoria salvato (offline)',
          color: 'info'
        })
        return true
      }
      console.error('Error updating due date / reminder:', err)
      restore(id, snapshot)
      offlineStorage.setTodos(todos.value)
      return false
    } finally {
      activeActionId.value = null
    }
  }

  async function markReminderSent(id: number): Promise<void> {
    const sentAt = new Date().toISOString()
    patch(id, { reminder_sent_at: sentAt })
    offlineStorage.setTodos(todos.value)
    try {
      await supabase.from('todos').update({ reminder_sent_at: sentAt }).eq('id', id)
    } catch (err: unknown) {
      console.error('Error marking reminder sent:', err)
    }
  }

  async function deleteTodo(id: number) {
    const target = todos.value.find(todo => todo.id === id)
    const snapshot = [...todos.value]
    activeActionId.value = id

    todos.value = todos.value.filter(todo => todo.id !== id)
    offlineStorage.setTodos(todos.value)

    if (id < 0) {
      removeMutationsForTempId(id)
      toast.add({
        title: 'Attività eliminata',
        description: target ? `"${target.title}" è stata rimossa` : undefined,
        color: 'neutral'
      })
      activeActionId.value = null
      return
    }

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueMutation({
        type: 'todo:delete',
        targetId: id
      })
      toast.add({
        title: 'Attività eliminata (offline)',
        description: target ? `"${target.title}" è stata rimossa` : undefined,
        color: 'neutral'
      })
      activeActionId.value = null
      return
    }

    try {
      const { data, error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'todo:delete',
            targetId: id
          })
          toast.add({
            title: 'Attività eliminata (offline)',
            description: target ? `"${target.title}" è stata rimossa` : undefined,
            color: 'neutral'
          })
          return
        }
        todos.value = snapshot
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Errore eliminazione',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        todos.value = snapshot
        offlineStorage.setTodos(todos.value)
        notPermitted('Eliminazione non eseguita')
      } else {
        toast.add({
          title: 'Attività eliminata',
          description: target ? `"${target.title}" è stata rimossa` : undefined,
          color: 'neutral'
        })
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'todo:delete',
          targetId: id
        })
        toast.add({
          title: 'Attività eliminata (offline)',
          description: target ? `"${target.title}" è stata rimossa` : undefined,
          color: 'neutral'
        })
        return
      }
      todos.value = snapshot
      offlineStorage.setTodos(todos.value)
      console.error('Error deleting todo:', err)
    } finally {
      activeActionId.value = null
    }
  }

  async function clearCompleted() {
    const completedIds = scopedTodos.value.filter(todo => todo.completed).map(todo => todo.id)
    if (completedIds.length === 0) return

    const targetIds = new Set(completedIds)
    const snapshot = [...todos.value]
    todos.value = todos.value.filter(todo => !targetIds.has(todo.id))
    offlineStorage.setTodos(todos.value)

    const tempIds = completedIds.filter(id => id < 0)
    const realIds = completedIds.filter(id => id > 0)

    for (const tempId of tempIds) {
      removeMutationsForTempId(tempId)
    }

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      for (const realId of realIds) {
        enqueueMutation({
          type: 'todo:delete',
          targetId: realId
        })
      }
      toast.add({
        title: 'Completati eliminati (offline)',
        description: `${completedIds.length} attività completate rimosse localmente`,
        color: 'neutral'
      })
      return
    }

    if (realIds.length === 0) {
      toast.add({
        title: 'Completati eliminati',
        description: `${tempIds.length} attività completate rimosse`,
        color: 'neutral'
      })
      return
    }

    try {
      const { data, error } = await supabase
        .from('todos')
        .delete()
        .in('id', realIds)
        .select('id')

      if (error) {
        if (isNetworkError(error)) {
          for (const realId of realIds) {
            enqueueMutation({
              type: 'todo:delete',
              targetId: realId
            })
          }
          toast.add({
            title: 'Completati eliminati (offline)',
            description: `${completedIds.length} attività rimosse localmente`,
            color: 'neutral'
          })
          return
        }
        todos.value = snapshot
        offlineStorage.setTodos(todos.value)
        toast.add({
          title: 'Errore durante la pulizia',
          description: error.message,
          color: 'error'
        })
        return
      }

      const removed = data?.length ?? 0
      if (removed === realIds.length) {
        toast.add({
          title: 'Completati eliminati',
          description: `${completedIds.length} attività completate rimosse`,
          color: 'neutral'
        })
      } else {
        await loadTodos()
        toast.add({
          title: 'Pulizia parziale',
          description: `${removed + tempIds.length} di ${completedIds.length} rimosse: le altre sono condivise in sola lettura.`,
          color: 'warning'
        })
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        for (const realId of realIds) {
          enqueueMutation({
            type: 'todo:delete',
            targetId: realId
          })
        }
        return
      }
      todos.value = snapshot
      offlineStorage.setTodos(todos.value)
      console.error('Error clearing completed:', err)
    }
  }

  function isShared(todo: TodoWithGroup): boolean {
    const id = userId.value
    if (!id) return false
    return Boolean(todo.user_id && todo.user_id !== id)
  }

  function countStats(list: TodoWithGroup[]): TodoStats {
    const total = list.length
    let completed = 0
    let overdue = 0
    let dueToday = 0

    const now = new Date()

    for (const todo of list) {
      if (todo.completed) {
        completed++
      } else {
        if (todo.due_at) {
          const bucket = dueBucket(todo.due_at, todo.due_all_day, now)
          if (bucket === 'overdue') overdue++
          else if (bucket === 'today') dueToday++
        }
      }
    }

    const active = total - completed
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, active, completed, percentage, overdue, dueToday }
  }

  const stats = computed<TodoStats>(() => countStats(todos.value))

  function inSelectedGroup(todo: TodoWithGroup): boolean {
    if (selectedGroupId.value === 'all') return true

    const group = todo.group
    if (!group) return false

    return group.path.includes(selectedGroupId.value)
  }

  const scopedTodos = computed<TodoWithGroup[]>(() => {
    if (selectedGroupId.value === 'all') return todos.value
    return todos.value.filter(inSelectedGroup)
  })

  const scopedStats = computed<TodoStats>(() => countStats(scopedTodos.value))

  const groupCounts = computed<Record<string, GroupCounts>>(() => {
    const counts: Record<string, GroupCounts> = {}

    const ensure = (id: string): GroupCounts => {
      counts[id] ??= { own: emptyStats(), total: emptyStats() }
      return counts[id]!
    }

    const add = (stats: TodoStats, completed: boolean) => {
      stats.total++
      if (completed) stats.completed++
      else stats.active++
      stats.percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
    }

    for (const todo of todos.value) {
      const group = todo.group
      if (!group) continue
      add(ensure(group.id).own, Boolean(todo.completed))
      for (const ancestorId of group.path) {
        add(ensure(ancestorId).total, Boolean(todo.completed))
      }
    }

    return counts
  })

  function timestampOf(todo: TodoWithGroup): number {
    if (!todo.created_at) return 0
    const value = Date.parse(todo.created_at)
    return Number.isNaN(value) ? 0 : value
  }

  function namePathOf(groupId: string): string[] {
    const group = groupsById.value.get(groupId)
    return group ? namePath(group.id) : []
  }

  function compareGroupPaths(a: string[], b: string[]): number {
    const length = Math.min(a.length, b.length)
    for (let i = 0; i < length; i++) {
      const order = a[i]!.localeCompare(b[i]!, 'it', { sensitivity: 'base' })
      if (order !== 0) return order
    }
    return a.length - b.length
  }

  function sortTodos(list: TodoWithGroup[], order: SortOrder): TodoWithGroup[] {
    const sorted = [...list]
    switch (order) {
      case 'due-asc': {
        sorted.sort((a, b) => {
          if (Boolean(a.completed) !== Boolean(b.completed)) {
            return Number(Boolean(a.completed)) - Number(Boolean(b.completed))
          }
          if (a.due_at && b.due_at) {
            const diff = Date.parse(a.due_at) - Date.parse(b.due_at)
            if (diff !== 0) return diff
            return timestampOf(b) - timestampOf(a)
          }
          if (a.due_at && !b.due_at) return -1
          if (!a.due_at && b.due_at) return 1
          return timestampOf(b) - timestampOf(a)
        })
        break
      }
      case 'created-asc':
        sorted.sort((a, b) => timestampOf(a) - timestampOf(b))
        break
      case 'title-asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' }))
        break
      case 'active-first':
        sorted.sort((a, b) =>
          Number(Boolean(a.completed)) - Number(Boolean(b.completed))
          || timestampOf(b) - timestampOf(a))
        break
      case 'group': {
        const paths = new Map<string, string[]>()
        const pathOf = (groupId: string | null): string[] => {
          const key = groupId ?? ''
          let path = paths.get(key)
          if (!path) {
            path = groupId ? namePathOf(groupId) : []
            paths.set(key, path)
          }
          return path
        }

        sorted.sort((a, b) =>
          compareGroupPaths(pathOf(a.group_id), pathOf(b.group_id))
          || timestampOf(b) - timestampOf(a))
        break
      }
      default:
        sorted.sort((a, b) => timestampOf(b) - timestampOf(a))
    }
    return sorted
  }

  const filteredTodos = computed(() => {
    let result = todos.value

    const me = userId.value
    if (me) {
      if (scope.value === 'mine') {
        result = result.filter(todo => !todo.user_id || todo.user_id === me)
      } else if (scope.value === 'shared') {
        result = result.filter(todo => Boolean(todo.user_id && todo.user_id !== me))
      }
    }

    if (selectedGroupId.value !== 'all') {
      result = result.filter(inSelectedGroup)
    }

    if (filter.value === 'active') {
      result = result.filter(todo => !todo.completed)
    } else if (filter.value === 'completed') {
      result = result.filter(todo => Boolean(todo.completed))
    } else if (filter.value === 'due') {
      result = result.filter(todo => !todo.completed && Boolean(todo.due_at))
    } else if (prefs.value.hideCompleted) {
      result = result.filter(todo => !todo.completed)
    }

    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
      result = result.filter(todo =>
        todo.title.toLowerCase().includes(query)
        || groupNameOf(todo).toLowerCase().includes(query)
      )
    }

    return sortTodos(result, prefs.value.sort)
  })

  const groupedTodos = computed<TodoSection[]>(() => {
    const buckets = new Map<string, TodoWithGroup[]>()
    for (const todo of filteredTodos.value) {
      const key = todo.group_id ?? ''
      const bucket = buckets.get(key)
      if (bucket) bucket.push(todo)
      else buckets.set(key, [todo])
    }

    const sections = Array.from(buckets.entries()).map(([groupId, items]) => ({
      groupId,
      name: groupId
        ? (groupsById.value.get(groupId)?.name ?? groupNameOf(items[0]!))
        : groupNameOf(items[0]!),
      todos: items
    }))

    sections.sort((a, b) => {
      if (!a.groupId || !b.groupId) return (a.groupId ? 1 : 0) - (b.groupId ? 1 : 0)
      return compareGroupPaths(namePathOf(a.groupId), namePathOf(b.groupId))
    })

    return sections
  })

  const groupsWithTasks = computed<string[]>(() => {
    const ids = new Set<string>()
    for (const todo of todos.value) {
      if (todo.group_id) ids.add(todo.group_id)
    }
    return Array.from(ids)
  })

  const todoCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const todo of todos.value) {
      if (!todo.group_id) continue
      counts[todo.group_id] = (counts[todo.group_id] ?? 0) + 1
    }
    return counts
  })

  return {
    todos,
    loading,
    isAdding,
    activeActionId,
    filter,
    scope,
    selectedGroupId,
    searchQuery,
    stats,
    scopedStats,
    scopedTodos,
    filteredTodos,
    groupedTodos,
    groupCounts,
    todoCounts,
    groupsWithTasks,
    isShared,
    groupNameOf,
    loadTodos,
    addTodo,
    toggleTodo,
    toggleTodos,
    updateTodoTitle,
    updateTodoGroup,
    updateTodoDueDate,
    markReminderSent,
    deleteTodo,
    clearCompleted
  }
}
