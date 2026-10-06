import type { Database } from '~/types/database.types'
import type { Todo, TodoFilter, TodoScope, TodoStats, TodoWithGroup, GroupCounts } from '~/types/todo'
import { usePreferences, type SortOrder } from '~/composables/usePreferences'
import { useGroups } from '~/composables/useGroups'

export interface TodoSection {
  /** Group id, or '' for the implicit bucket a row without a group falls into. */
  groupId: string
  name: string
  todos: TodoWithGroup[]
}

/** The columns the list needs from an embedded group. */
const GROUP_COLUMNS = 'id, name, parent_id, path, depth, tone, icon'

function emptyStats(): TodoStats {
  return { total: 0, active: 0, completed: 0, percentage: 0 }
}

/**
 * Activities.
 *
 * An activity lives in a group *row* (`group_id`), not in a name: that is what makes
 * sub-groups possible. Everything the list needs — which group a task belongs to,
 * what it is called, whether it is inside the selected group's sub-tree, and what the
 * current user may do with it — is derived from the group's `path`, which the database
 * keeps as the ancestor chain including the group itself.
 *
 * The `group_name` column still travels with each row: it is a display mirror the
 * database maintains, so a row whose group has become unreadable (a revoked grant)
 * still shows a label instead of a blank.
 *
 * Group *management* (create, rename, move, delete, colours) lives in `useGroups`.
 */
export function useTodos() {
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const { prefs } = usePreferences()
  const { groupsById, namePath } = useGroups()
  const toast = useToast()

  const todos = useState<TodoWithGroup[]>('todos-list', () => [])
  const loading = useState<boolean>('todos-loading', () => false)
  const isAdding = useState<boolean>('todos-is-adding', () => false)
  const activeActionId = useState<number | null>('todos-active-id', () => null)

  const filter = useState<TodoFilter>('todos-filter', () => 'all')
  const scope = useState<TodoScope>('todos-scope', () => 'all')
  /** 'all', or the id of the group being shown (the group page pushes it). */
  const selectedGroupId = useState<string>('todos-selected-group-id', () => 'all')
  const searchQuery = useState<string>('todos-search', () => '')

  async function loadTodos() {
    loading.value = true
    try {
      // The embedded group carries name, tone and `path`; the generated types do not
      // know the relationship yet, so the result is narrowed here.
      const { data, error } = await supabase
        .from('todos')
        .select(`*, group:groups(${GROUP_COLUMNS})`)
        .order('created_at', { ascending: false }) as unknown as {
          data: TodoWithGroup[] | null
          error: { message: string } | null
        }

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

  function patch(id: number, changes: Partial<TodoWithGroup>) {
    todos.value = todos.value.map(todo => (todo.id === id ? { ...todo, ...changes } : todo))
  }

  function restore(id: number, snapshot: TodoWithGroup | undefined) {
    if (snapshot) {
      todos.value = todos.value.map(todo => (todo.id === id ? snapshot : todo))
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

  /** Name of the group a row sits in, falling back to the mirrored column. */
  function groupNameOf(todo: TodoWithGroup): string {
    return (todo.group?.name || todo.group_name || 'Generale').trim() || 'Generale'
  }

  async function addTodo(rawTitle: string, groupId?: string | null): Promise<boolean> {
    const title = rawTitle.trim()
    if (!title) return false

    isAdding.value = true
    try {
      const payload: Database['public']['Tables']['todos']['Insert'] = {
        title,
        group_id: groupId ?? null,
        completed: false
      }

      if (userId.value) {
        payload.user_id = userId.value
      }

      const { data, error } = await supabase
        .from('todos')
        .insert(payload)
        .select(`*, group:groups(${GROUP_COLUMNS})`)
        .single() as unknown as {
          data: TodoWithGroup | null
          error: { message: string } | null
        }

      if (error) {
        toast.add({
          title: 'Errore inserimento',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (data) {
        todos.value = [data, ...todos.value.filter(todo => todo.id !== data.id)]
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

    const snapshot = todos.value.find(todo => todo.id === id)
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

  async function updateTodoGroup(id: number, groupId: string | null) {
    const snapshot = todos.value.find(todo => todo.id === id)
    if (!snapshot || (snapshot.group_id ?? null) === (groupId ?? null)) return

    patch(id, { group_id: groupId })

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
        // Take the row the database returned: it carries the mirrored group name.
        patch(id, data[0]!)
        toast.add({
          title: 'Gruppo aggiornato',
          description: `Spostato in "${groupNameOf(data[0]!)}"`,
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
    const target = todos.value.find(todo => todo.id === id)
    const snapshot = [...todos.value]
    activeActionId.value = id

    todos.value = todos.value.filter(todo => todo.id !== id)

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
    // Scoped to the current group on purpose: on a group page "delete completed"
    // must not reach the completed activities of every other group.
    const completedIds = scopedTodos.value.filter(todo => todo.completed).map(todo => todo.id)
    if (completedIds.length === 0) return

    const targetIds = new Set(completedIds)
    const snapshot = [...todos.value]
    todos.value = todos.value.filter(todo => !targetIds.has(todo.id))

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

  function isShared(todo: TodoWithGroup): boolean {
    const id = userId.value
    if (!id) return false
    return Boolean(todo.user_id && todo.user_id !== id)
  }

  function countStats(list: TodoWithGroup[]): TodoStats {
    const total = list.length
    const completed = list.filter(todo => Boolean(todo.completed)).length
    const active = total - completed
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, active, completed, percentage }
  }

  const stats = computed<TodoStats>(() => countStats(todos.value))

  /** True when the activity sits in the selected group or anywhere below it. */
  function inSelectedGroup(todo: TodoWithGroup): boolean {
    if (selectedGroupId.value === 'all') return true

    const group = todo.group
    if (!group) return false

    // `path` is {root, …, self}: the selection is in there when the task is the
    // selected group itself or one of its descendants.
    return group.path.includes(selectedGroupId.value)
  }

  /**
   * The activities the current page is actually about: everything, or the selected
   * group *and its sub-groups* (`selectedGroupId` is pushed by `/g/…`).
   *
   * The filter tabs, the empty state and "delete completed" all read from here
   * rather than from the whole list — otherwise a group page would show global
   * counters, and clearing completed there would delete rows of other groups.
   */
  const scopedTodos = computed<TodoWithGroup[]>(() => {
    if (selectedGroupId.value === 'all') return todos.value
    return todos.value.filter(inSelectedGroup)
  })

  const scopedStats = computed<TodoStats>(() => countStats(scopedTodos.value))

  /**
   * Per-group tallies, by group id: what the group itself holds (`own`) and what its
   * whole sub-tree holds (`total`). The card of a parent group shows the second.
   */
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
      // Every ancestor — `path` includes the group itself.
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

  /** Name path of a group — "Lavoro", "Lavoro/Clienti" — for ordering and labels. */
  function namePathOf(groupId: string): string[] {
    const group = groupsById.value.get(groupId)
    return group ? namePath(group.id) : []
  }

  /** Hierarchical comparison: parents before children, siblings by name. */
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
        // The name path is resolved once per group instead of once per comparison,
        // and compared segment by segment: a flat string comparison would put
        // "Lavoro2" among the children of "Lavoro".
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

    // Scope filter (mine vs shared)
    const me = userId.value
    if (me) {
      if (scope.value === 'mine') {
        result = result.filter(todo => !todo.user_id || todo.user_id === me)
      } else if (scope.value === 'shared') {
        result = result.filter(todo => Boolean(todo.user_id && todo.user_id !== me))
      }
    }

    // Group filter — the selected group and everything below it
    if (selectedGroupId.value !== 'all') {
      result = result.filter(inSelectedGroup)
    }

    // Status filter
    if (filter.value === 'active') {
      result = result.filter(todo => !todo.completed)
    } else if (filter.value === 'completed') {
      result = result.filter(todo => Boolean(todo.completed))
    } else if (prefs.value.hideCompleted) {
      // Only meaningful for the "Tutti" tab: the other tabs already say which
      // half of the list you asked for.
      result = result.filter(todo => !todo.completed)
    }

    // Search query
    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
      result = result.filter(todo =>
        todo.title.toLowerCase().includes(query)
        || groupNameOf(todo).toLowerCase().includes(query)
      )
    }

    return sortTodos(result, prefs.value.sort)
  })

  /** Activities split per group, used when the sort order is "group". */
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
        ? (groupsById.value.get(groupId)?.name ?? groupNameOf(items[0]!) )
        : groupNameOf(items[0]!),
      todos: items
    }))

    sections.sort((a, b) => {
      if (!a.groupId || !b.groupId) return (a.groupId ? 1 : 0) - (b.groupId ? 1 : 0)
      return compareGroupPaths(namePathOf(a.groupId), namePathOf(b.groupId))
    })

    return sections
  })

  /** The groups that actually hold something, nearest first: for the filter pickers. */
  const groupsWithTasks = computed<string[]>(() => {
    const ids = new Set<string>()
    for (const todo of todos.value) {
      if (todo.group_id) ids.add(todo.group_id)
    }
    return Array.from(ids)
  })

  /** Number of activities per group, id-keyed (what the notes do for notes). */
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
    updateTodoTitle,
    updateTodoGroup,
    deleteTodo,
    clearCompleted
  }
}
