import type { Database } from '~/types/database.types'
import type { Todo, TodoFilter, TodoScope, TodoStats } from '~/types/todo'
import { DEFAULT_GROUPS, getGroupMeta, type GroupMeta, type GroupStyle } from '~/utils/groups'
import { usePreferences, type SortOrder } from '~/composables/usePreferences'

export interface TodoSection {
  name: string
  meta: GroupMeta
  todos: Todo[]
}

export function useTodos() {
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const {
    prefs,
    patch: patchPreferences,
    addCustomGroup,
    removeCustomGroup,
    markGroupRemoved,
    restoreGroups: restoreGroupPresets,
    setGroupStyle: persistGroupStyle
  } = usePreferences()
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

  const groupsWithTasks = computed<string[]>(() => {
    const set = new Set<string>()
    todos.value.forEach((t) => {
      const name = (t.group_name || 'Generale').trim()
      if (name) {
        set.add(name)
      }
    })
    return Array.from(set)
  })

  /**
   * Every group the user can file an activity under: the presets (minus the ones
   * they removed), the groups they created — kept even while empty — and any group
   * still referenced by an activity.
   *
   * A removed preset always comes back if activities still use it (a read-only
   * shared list cannot be re-homed), so nothing becomes unreachable.
   *
   * The array reference is kept stable while the contents are unchanged: this value
   * is passed to every row, and a fresh array on each mutation would re-render all
   * of them.
   */
  const groupsRef = shallowRef<string[]>([])

  const availableGroups = computed<string[]>(() => {
    const set = new Set<string>()
    const withTasks = new Set(groupsWithTasks.value.map(name => name.toLowerCase()))

    DEFAULT_GROUPS.forEach((group) => {
      const name = group.name
      if (!isRemovedGroup(name) || withTasks.has(name.toLowerCase())) {
        set.add(name)
      }
    })

    prefs.value.customGroups.forEach((g) => {
      const name = g.trim()
      if (name) set.add(name)
    })

    groupsWithTasks.value.forEach(name => set.add(name))

    const next = Array.from(set)
    const previous = groupsRef.value
    if (previous.length === next.length && previous.every((value, index) => value === next[index])) {
      return previous
    }
    groupsRef.value = next
    return next
  })

  /** Groups the user owns and may delete (presets always stay). */
  const customGroups = computed<string[]>(() => prefs.value.customGroups)

  function styleFor(name: string): GroupStyle | undefined {
    const styles = prefs.value.groupStyles
    if (styles[name]) return styles[name]
    const key = Object.keys(styles).find(k => k.toLowerCase() === name.toLowerCase())
    return key ? styles[key] : undefined
  }

  /** Badge colour/icon for a group name, honouring user customisation. */
  function groupMeta(name?: string | null): GroupMeta {
    const clean = (name || 'Generale').trim() || 'Generale'
    return getGroupMeta(clean, styleFor(clean))
  }

  function isCustomGroup(name: string): boolean {
    const clean = name.trim().toLowerCase()
    return customGroups.value.some(g => g.toLowerCase() === clean)
  }

  function isPresetGroup(name: string): boolean {
    const clean = name.trim().toLowerCase()
    return DEFAULT_GROUPS.some(g => g.name.toLowerCase() === clean)
  }

  /** Preset groups the user removed (restorable from the settings panel). */
  const removedGroups = computed<string[]>(() => prefs.value.removedGroups ?? [])

  function isRemovedGroup(name: string): boolean {
    const clean = name.trim().toLowerCase()
    return removedGroups.value.some(g => g.toLowerCase() === clean)
  }

  /** "Generale" is the bucket activities without a group fall into. */
  function isFallbackGroup(name: string): boolean {
    return name.trim().toLowerCase() === 'generale'
  }

  function addGroup(name: string, style?: Partial<GroupStyle>): string | null {
    const clean = name.trim()
    if (!clean) return null
    const existing = availableGroups.value.find(g => g.toLowerCase() === clean.toLowerCase())
    if (existing) {
      if (style) persistGroupStyle(existing, style)
      return existing
    }
    addCustomGroup(clean)
    if (style) persistGroupStyle(clean, style)
    return clean
  }

  function setGroupStyle(name: string, style: Partial<GroupStyle>) {
    persistGroupStyle(name.trim(), style)
  }

  function clearGroupStyle(name: string) {
    const styles = { ...prefs.value.groupStyles }
    const key = Object.keys(styles).find(k => k.toLowerCase() === name.trim().toLowerCase())
    if (key) delete styles[key]
    patchPreferences({ groupStyles: styles })
  }

  /**
   * Delete a group. Its activities are moved to "Generale" first, and a partial
   * move (read-only shares) rolls back rather than leaving the list inconsistent.
   *
   * Presets are not rows in a table — the removal is remembered in the preferences
   * (and can be undone from the settings panel), while a custom group is dropped
   * for good.
   */
  async function deleteGroup(name: string): Promise<boolean> {
    const clean = name.trim()
    if (!clean) return false

    if (isFallbackGroup(clean)) {
      toast.add({
        title: 'Gruppo non eliminabile',
        description: '"Generale" raccoglie le attività senza gruppo: non può essere rimosso.',
        color: 'warning'
      })
      return false
    }

    const affected = todos.value.filter(
      t => (t.group_name || 'Generale').toLowerCase() === clean.toLowerCase()
    )

    if (affected.length > 0) {
      const ids = affected.map(t => t.id)
      const snapshot = [...todos.value]
      todos.value = todos.value.map(t => (ids.includes(t.id) ? { ...t, group_name: 'Generale' } : t))

      const { data, error } = await supabase
        .from('todos')
        .update({ group_name: 'Generale' })
        .in('id', ids)
        .select('id')

      if (error || (data?.length ?? 0) !== ids.length) {
        todos.value = snapshot
        toast.add({
          title: 'Gruppo non eliminato',
          description: error?.message ?? 'Alcune attività sono condivise in sola lettura.',
          color: 'error'
        })
        return false
      }
    }

    if (isPresetGroup(clean)) {
      markGroupRemoved(clean)
    } else {
      removeCustomGroup(clean)
    }

    // Leaving the filter pointed at a group that no longer exists would show an
    // empty list with no obvious way back.
    if (selectedGroup.value.toLowerCase() === clean.toLowerCase()) {
      selectedGroup.value = 'all'
    }

    toast.add({
      title: 'Gruppo eliminato',
      description: affected.length > 0
        ? `${affected.length} attività spostate in "Generale".`
        : undefined,
      color: 'neutral'
    })
    return true
  }

  /** Bring back one removed preset group. */
  function restoreGroup(name: string): boolean {
    const clean = name.trim()
    if (!clean || !isRemovedGroup(clean)) return false

    restoreGroupPresets(clean)
    toast.add({
      title: 'Gruppo ripristinato',
      description: `"${clean}" è di nuovo disponibile.`,
      color: 'success'
    })
    return true
  }

  /** Bring back every removed preset group at once. */
  function restoreAllGroups(): number {
    const removed = removedGroups.value
    if (removed.length === 0) return 0

    restoreGroupPresets()
    toast.add({
      title: 'Gruppi predefiniti ripristinati',
      description: `${removed.length} gruppi sono tornati disponibili.`,
      color: 'success'
    })
    return removed.length
  }

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

  function timestampOf(todo: Todo): number {
    if (!todo.created_at) return 0
    const value = Date.parse(todo.created_at)
    return Number.isNaN(value) ? 0 : value
  }

  /** Group name used for bucketing: "Generale" is the default and sorts first. */
  function groupKeyOf(todo: Todo): string {
    return (todo.group_name || 'Generale').trim() || 'Generale'
  }

  function sortTodos(list: Todo[], order: SortOrder): Todo[] {
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
      case 'group':
        sorted.sort((a, b) => {
          const rank = (todo: Todo) => (groupKeyOf(todo).toLowerCase() === 'generale' ? '' : groupKeyOf(todo).toLowerCase())
          return rank(a).localeCompare(rank(b), 'it', { sensitivity: 'base' })
            || timestampOf(b) - timestampOf(a)
        })
        break
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
    } else if (prefs.value.hideCompleted) {
      // Only meaningful for the "Tutti" tab: the other tabs already say which
      // half of the list you asked for.
      result = result.filter(t => !t.completed)
    }

    // Search query
    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
      result = result.filter(t =>
        t.title.toLowerCase().includes(query) ||
        (t.group_name && t.group_name.toLowerCase().includes(query))
      )
    }

    return sortTodos(result, prefs.value.sort)
  })

  /** Activities split per group, used when the sort order is "group". */
  const groupedTodos = computed<TodoSection[]>(() => {
    const buckets = new Map<string, Todo[]>()
    for (const todo of filteredTodos.value) {
      const name = groupKeyOf(todo)
      const bucket = buckets.get(name)
      if (bucket) {
        bucket.push(todo)
      } else {
        buckets.set(name, [todo])
      }
    }
    return Array.from(buckets.entries()).map(([name, items]) => ({
      name,
      meta: groupMeta(name),
      todos: items
    }))
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
    customGroups,
    removedGroups,
    groupsWithTasks,
    groupStats,
    groupStyles: computed(() => prefs.value.groupStyles),
    filteredTodos,
    groupedTodos,
    stats,
    isShared,
    groupMeta,
    isCustomGroup,
    isPresetGroup,
    isRemovedGroup,
    isFallbackGroup,
    addGroup,
    setGroupStyle,
    clearGroupStyle,
    deleteGroup,
    restoreGroup,
    restoreAllGroups,
    loadTodos,
    addTodo,
    toggleTodo,
    updateTodoTitle,
    updateTodoGroup,
    deleteTodo,
    clearCompleted
  }
}
