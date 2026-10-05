import type { Database } from '~/types/database.types'
import type { Todo, TodoFilter, TodoScope, TodoStats } from '~/types/todo'
import { DEFAULT_GROUPS } from '~/utils/groups'

export function useTodos() {
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const toast = useToast()

  const todos = useState<Todo[]>('todos-list', () => [])
  const loading = useState<boolean>('todos-loading', () => false)
  const isAdding = useState<boolean>('todos-is-adding', () => false)
  const activeActionId = useState<number | null>('todos-active-id', () => null)

  const filter = useState<TodoFilter>('todos-filter', () => 'all')
  const scope = useState<TodoScope>('todos-scope', () => 'all')
  const selectedGroup = useState<string>('todos-selected-group', () => 'all')
  const searchQuery = useState<string>('todos-search', () => '')

  async function loadTodos() {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching todos:', error)
        toast.add({
          title: 'Errore nel caricamento',
          description: error.message || 'Impossibile caricare i task',
          color: 'error'
        })
        return
      }

      todos.value = data ?? []
    } catch (err: unknown) {
      console.error('Unexpected error loading todos:', err)
    } finally {
      loading.value = false
    }
  }

  function patch(id: number, changes: Partial<Todo>) {
    todos.value = todos.value.map(t => (t.id === id ? { ...t, ...changes } : t))
  }

  function restore(id: number, snapshot: Todo | undefined) {
    if (snapshot) {
      todos.value = todos.value.map(t => (t.id === id ? snapshot : t))
    }
  }

  /**
   * Postgres filters out rows a policy forbids instead of raising an error, so an
   * update/delete that touched nothing is exactly what a read-only share looks like.
   * Every write below asks for the affected rows back and treats "none" as a refusal.
   */
  function notPermitted(action: string) {
    toast.add({
      title: 'Modifica non consentita',
      description: `${action}: l'attività è condivisa in sola lettura oppure non è più accessibile.`,
      color: 'warning'
    })
  }

  async function addTodo(rawTitle: string, rawGroup?: string): Promise<boolean> {
    const title = rawTitle.trim()
    if (!title) return false

    const groupName = rawGroup?.trim() || 'Generale'

    isAdding.value = true
    try {
      const payload: Database['public']['Tables']['todos']['Insert'] = {
        title,
        group_name: groupName,
        completed: false
      }

      if (userId.value) {
        payload.user_id = userId.value
      }

      const { data, error } = await supabase
        .from('todos')
        .insert(payload)
        .select()
        .single()

      if (error) {
        toast.add({
          title: 'Errore inserimento',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (data) {
        todos.value = [data, ...todos.value.filter(t => t.id !== data.id)]
      } else {
        await loadTodos()
      }

      toast.add({
        title: 'Attività creata',
        description: `"${title}" aggiunta in "${groupName}"`,
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      console.error('Error adding todo:', err)
      return false
    } finally {
      isAdding.value = false
    }
  }

  async function toggleTodo(todo: Todo) {
    const snapshot = { ...todo }
    const nextCompleted = !todo.completed

    // Optimistic local update
    patch(todo.id, { completed: nextCompleted })

    activeActionId.value = todo.id
    try {
      const { data, error } = await supabase
        .from('todos')
        .update({ completed: nextCompleted })
        .eq('id', todo.id)
        .select('id')

      if (error) {
        restore(todo.id, snapshot)
        toast.add({
          title: 'Errore aggiornamento',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        restore(todo.id, snapshot)
        notPermitted('Spunta non salvata')
      }
    } catch (err: unknown) {
      console.error('Error toggling todo:', err)
      restore(todo.id, snapshot)
    } finally {
      activeActionId.value = null
    }
  }

  async function updateTodoTitle(id: number, newTitle: string) {
    const trimmed = newTitle.trim()
    if (!trimmed) return

    const snapshot = todos.value.find(t => t.id === id)
    if (!snapshot || snapshot.title === trimmed) return

    patch(id, { title: trimmed })

    activeActionId.value = id
    try {
      const { data, error } = await supabase
        .from('todos')
        .update({ title: trimmed })
        .eq('id', id)
        .select('id')

      if (error) {
        restore(id, snapshot)
        toast.add({
          title: 'Errore modifica',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        restore(id, snapshot)
        notPermitted('Titolo non salvato')
      } else {
        toast.add({
          title: 'Attività modificata',
          color: 'success'
        })
      }
    } catch (err: unknown) {
      console.error('Error updating title:', err)
      restore(id, snapshot)
    } finally {
      activeActionId.value = null
    }
  }

  async function updateTodoGroup(id: number, newGroup: string) {
    const trimmed = newGroup.trim() || 'Generale'
    const snapshot = todos.value.find(t => t.id === id)
    if (!snapshot || (snapshot.group_name || 'Generale') === trimmed) return

    patch(id, { group_name: trimmed })

    activeActionId.value = id
    try {
      const { data, error } = await supabase
        .from('todos')
        .update({ group_name: trimmed })
        .eq('id', id)
        .select('id')

      if (error) {
        restore(id, snapshot)
        toast.add({
          title: 'Errore spostamento',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        restore(id, snapshot)
        notPermitted('Spostamento non salvato')
      } else {
        toast.add({
          title: 'Gruppo aggiornato',
          description: `Spostato in "${trimmed}"`,
          color: 'success'
        })
      }
    } catch (err: unknown) {
      console.error('Error updating group:', err)
      restore(id, snapshot)
    } finally {
      activeActionId.value = null
    }
  }

  async function deleteTodo(id: number) {
    const target = todos.value.find(t => t.id === id)
    const snapshot = [...todos.value]
    activeActionId.value = id

    todos.value = todos.value.filter(t => t.id !== id)

    try {
      const { data, error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) {
        todos.value = snapshot
        toast.add({
          title: 'Errore eliminazione',
          description: error.message,
          color: 'error'
        })
      } else if (!data || data.length === 0) {
        todos.value = snapshot
        notPermitted('Eliminazione non eseguita')
      } else {
        toast.add({
          title: 'Attività eliminata',
          description: target ? `"${target.title}" è stata rimossa` : undefined,
          color: 'neutral'
        })
      }
    } catch (err: unknown) {
      todos.value = snapshot
      console.error('Error deleting todo:', err)
    } finally {
      activeActionId.value = null
    }
  }

  async function clearCompleted() {
    const completedIds = todos.value.filter(t => t.completed).map(t => t.id)
    if (completedIds.length === 0) return

    const snapshot = [...todos.value]
    todos.value = todos.value.filter(t => !t.completed)

    try {
      const { data, error } = await supabase
        .from('todos')
        .delete()
        .in('id', completedIds)
        .select('id')

      if (error) {
        todos.value = snapshot
        toast.add({
          title: 'Errore durante la pulizia',
          description: error.message,
          color: 'error'
        })
        return
      }

      const removed = data?.length ?? 0
      if (removed === completedIds.length) {
        toast.add({
          title: 'Completati eliminati',
          description: `${removed} attività completate rimosse`,
          color: 'neutral'
        })
      } else {
        // Some were read-only shares: resync rather than trust the optimistic list.
        await loadTodos()
        toast.add({
          title: 'Pulizia parziale',
          description: `${removed} di ${completedIds.length} rimosse: le altre sono condivise in sola lettura.`,
          color: 'warning'
        })
      }
    } catch (err: unknown) {
      todos.value = snapshot
      console.error('Error clearing completed:', err)
    }
  }

  function isShared(todo: Todo): boolean {
    const id = userId.value
    if (!id) return false
    return Boolean(todo.user_id && todo.user_id !== id)
  }

  const stats = computed<TodoStats>(() => {
    const total = todos.value.length
    const completed = todos.value.filter(t => Boolean(t.completed)).length
    const active = total - completed
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, active, completed, percentage }
  })

  const availableGroups = computed<string[]>(() => {
    const set = new Set<string>()
    DEFAULT_GROUPS.forEach(g => set.add(g.name))
    todos.value.forEach(t => {
      if (t.group_name && t.group_name.trim()) {
        set.add(t.group_name.trim())
      }
    })
    return Array.from(set)
  })

  const groupStats = computed<Record<string, { total: number; active: number; completed: number }>>(() => {
    const counts: Record<string, { total: number; active: number; completed: number }> = {}
    for (const t of todos.value) {
      const name = (t.group_name || 'Generale').trim()
      if (!counts[name]) {
        counts[name] = { total: 0, active: 0, completed: 0 }
      }
      counts[name].total++
      if (t.completed) {
        counts[name].completed++
      } else {
        counts[name].active++
      }
    }
    return counts
  })

  const filteredTodos = computed(() => {
    let result = todos.value

    // Scope filter (mine vs shared)
    const me = userId.value
    if (me) {
      if (scope.value === 'mine') {
        result = result.filter(t => !t.user_id || t.user_id === me)
      } else if (scope.value === 'shared') {
        result = result.filter(t => Boolean(t.user_id && t.user_id !== me))
      }
    }

    // Group filter
    if (selectedGroup.value !== 'all') {
      result = result.filter(t => (t.group_name || 'Generale') === selectedGroup.value)
    }

    // Status filter
    if (filter.value === 'active') {
      result = result.filter(t => !t.completed)
    } else if (filter.value === 'completed') {
      result = result.filter(t => Boolean(t.completed))
    }

    // Search query
    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
      result = result.filter(t =>
        t.title.toLowerCase().includes(query) ||
        (t.group_name && t.group_name.toLowerCase().includes(query))
      )
    }

    return result
  })

  return {
    todos,
    loading,
    isAdding,
    activeActionId,
    filter,
    scope,
    selectedGroup,
    searchQuery,
    availableGroups,
    groupStats,
    filteredTodos,
    stats,
    isShared,
    loadTodos,
    addTodo,
    toggleTodo,
    updateTodoTitle,
    updateTodoGroup,
    deleteTodo,
    clearCompleted
  }
}
