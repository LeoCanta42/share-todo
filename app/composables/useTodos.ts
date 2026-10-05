import type { Database } from '~/types/database.types'
import type { Todo, TodoFilter, TodoStats } from '~/types/todo'
import { DEFAULT_GROUPS } from '~/utils/groups'

export function useTodos() {
  const supabase = useSupabaseClient<Database>()
  const toast = useToast()

  const todos = useState<Todo[]>('todos-list', () => [])
  const loading = useState<boolean>('todos-loading', () => false)
  const isAdding = useState<boolean>('todos-is-adding', () => false)
  const activeActionId = useState<number | null>('todos-active-id', () => null)

  const filter = useState<TodoFilter>('todos-filter', () => 'all')
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

  async function addTodo(rawTitle: string, rawGroup?: string): Promise<boolean> {
    const title = rawTitle.trim()
    if (!title) return false

    const groupName = rawGroup?.trim() || 'Generale'

    isAdding.value = true
    try {
      const { data, error } = await supabase
        .from('todos')
        .insert({
          title,
          group_name: groupName,
          completed: false
        })
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
    const nextCompleted = !todo.completed
    const originalCompleted = todo.completed

    // Optimistic local update
    todos.value = todos.value.map(t =>
      t.id === todo.id ? { ...t, completed: nextCompleted } : t
    )

    activeActionId.value = todo.id
    try {
      const { error } = await supabase
        .from('todos')
        .update({ completed: nextCompleted })
        .eq('id', todo.id)

      if (error) {
        // Revert on error
        todos.value = todos.value.map(t =>
          t.id === todo.id ? { ...t, completed: originalCompleted } : t
        )
        toast.add({
          title: 'Errore aggiornamento',
          description: error.message,
          color: 'error'
        })
      }
    } catch (err: unknown) {
      console.error('Error toggling todo:', err)
      todos.value = todos.value.map(t =>
        t.id === todo.id ? { ...t, completed: originalCompleted } : t
      )
    } finally {
      activeActionId.value = null
    }
  }

  async function updateTodoTitle(id: number, newTitle: string) {
    const trimmed = newTitle.trim()
    if (!trimmed) return

    const previousTodo = todos.value.find(t => t.id === id)
    if (!previousTodo || previousTodo.title === trimmed) return

    todos.value = todos.value.map(t =>
      t.id === id ? { ...t, title: trimmed } : t
    )

    activeActionId.value = id
    try {
      const { error } = await supabase
        .from('todos')
        .update({ title: trimmed })
        .eq('id', id)

      if (error) {
        todos.value = todos.value.map(t =>
          t.id === id ? { ...t, title: previousTodo.title } : t
        )
        toast.add({
          title: 'Errore modifica',
          description: error.message,
          color: 'error'
        })
      } else {
        toast.add({
          title: 'Attività modificata',
          color: 'success'
        })
      }
    } finally {
      activeActionId.value = null
    }
  }

  async function updateTodoGroup(id: number, newGroup: string) {
    const trimmed = newGroup.trim() || 'Generale'
    const previousTodo = todos.value.find(t => t.id === id)
    if (!previousTodo || (previousTodo.group_name || 'Generale') === trimmed) return

    todos.value = todos.value.map(t =>
      t.id === id ? { ...t, group_name: trimmed } : t
    )

    activeActionId.value = id
    try {
      const { error } = await supabase
        .from('todos')
        .update({ group_name: trimmed })
        .eq('id', id)

      if (error) {
        todos.value = todos.value.map(t =>
          t.id === id ? { ...t, group_name: previousTodo.group_name } : t
        )
        toast.add({
          title: 'Errore spostamento',
          description: error.message,
          color: 'error'
        })
      } else {
        toast.add({
          title: 'Gruppo aggiornato',
          description: `Spostato in "${trimmed}"`,
          color: 'success'
        })
      }
    } finally {
      activeActionId.value = null
    }
  }

  async function deleteTodo(id: number) {
    const target = todos.value.find(t => t.id === id)
    activeActionId.value = id

    const previousList = [...todos.value]
    todos.value = todos.value.filter(t => t.id !== id)

    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)

      if (error) {
        todos.value = previousList
        toast.add({
          title: 'Errore eliminazione',
          description: error.message,
          color: 'error'
        })
      } else {
        toast.add({
          title: 'Attività eliminata',
          description: target ? `"${target.title}" è stata rimossa` : undefined,
          color: 'neutral'
        })
      }
    } finally {
      activeActionId.value = null
    }
  }

  async function clearCompleted() {
    const completedIds = todos.value.filter(t => t.completed).map(t => t.id)
    if (completedIds.length === 0) return

    const previousList = [...todos.value]
    todos.value = todos.value.filter(t => !t.completed)

    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .in('id', completedIds)

      if (error) {
        todos.value = previousList
        toast.add({
          title: 'Errore durante la pulizia',
          description: error.message,
          color: 'error'
        })
      } else {
        toast.add({
          title: 'Completati eliminati',
          description: `${completedIds.length} attività completate rimosse`,
          color: 'neutral'
        })
      }
    } catch (err: unknown) {
      todos.value = previousList
      console.error('Error clearing completed:', err)
    }
  }

  const stats = computed<TodoStats>(() => {
    const total = todos.value.length
    const completed = todos.value.filter(t => Boolean(t.completed)).length
    const active = total - completed
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, active, completed, percentage }
  })

  // List of all active/existing groups dynamically aggregated
  const availableGroups = computed<string[]>(() => {
    const set = new Set<string>()
    // Include default suggestions
    DEFAULT_GROUPS.forEach(g => set.add(g.name))
    // Include all groups currently in database
    todos.value.forEach(t => {
      if (t.group_name && t.group_name.trim()) {
        set.add(t.group_name.trim())
      }
    })
    return Array.from(set)
  })

  // Count of items per group
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
    selectedGroup,
    searchQuery,
    availableGroups,
    groupStats,
    filteredTodos,
    stats,
    loadTodos,
    addTodo,
    toggleTodo,
    updateTodoTitle,
    updateTodoGroup,
    deleteTodo,
    clearCompleted
  }
}
