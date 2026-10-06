import type { Database } from '~/types/database.types'
import type { Group, NewGroup } from '~/types/group'
import {
  MAX_GROUP_DEPTH,
  buildGroupTree,
  canNestUnder,
  depthUnder,
  flattenGroupTree,
  groupNamePath,
  resolveGroupPath
} from '~/utils/groupTree'

/**
 * The group tree.
 *
 * Groups are rows now (see `supabase/schema.sql`, section 1.5), so this is the one
 * place that reads and writes them. What comes back is everything the signed-in user
 * may see: their own tree plus any branch someone shared with them — the policies
 * decide that, not this composable.
 *
 * Two things worth knowing about the shape of the data:
 * - `path` is the ancestor chain *including the group itself*, maintained by the
 *   database. Ancestry questions ("is this group inside that one?") are answered from
 *   it, never by walking parents in a loop.
 * - a sub-group whose parent is not visible (a share can hand you a branch without its
 *   ancestors) is treated as a root by the tree builder, so the UI always has
 *   something to render.
 */
export function useGroups() {
  const supabase = useSupabaseClient<Database>()
  const toast = useToast()
  // Captured here, during setup: `migrateLegacyGroupPrefs` is awaited from a watcher,
  // and a composable called after an `await` has no Nuxt instance to read.
  const { takeLegacyGroupState } = usePreferences()

  const groups = useState<Group[]>('groups-list', () => [])
  const loading = useState<boolean>('groups-loading', () => false)

  async function loadGroups() {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('depth', { ascending: true })
        .order('name', { ascending: true })

      if (error) {
        console.error('Error fetching groups:', error)
        toast.add({
          title: 'Errore nel caricamento',
          description: error.message || 'Impossibile caricare i gruppi',
          color: 'error'
        })
        return
      }

      groups.value = data ?? []
    } catch (err: unknown) {
      console.error('Unexpected error loading groups:', err)
    } finally {
      loading.value = false
    }
  }

  const groupsById = computed(() => new Map(groups.value.map(group => [group.id, group])))

  /** Nested view, parents first. */
  const tree = computed(() => buildGroupTree(groups.value))

  /** Depth-first, flattened: what a picker or a move dialog walks. */
  const flat = computed(() => flattenGroupTree(tree.value))

  /** Groups the signed-in user owns (a shared branch belongs to someone else). */
  const ownGroups = computed(() => groups.value.filter(group => group.owner_id !== null && isOwn(group)))
  const { userId } = useCurrentUser()
  function isOwn(group: Group): boolean {
    return Boolean(userId.value && group.owner_id === userId.value)
  }

  function byId(id?: string | null): Group | undefined {
    return id ? groupsById.value.get(id) : undefined
  }

  /** "Lavoro/Clienti" — the readable address of a group, for the /g/ route. */
  function namePath(id: string): string[] {
    return groupNamePath(groups.value, id)
  }

  /** The group a /g/Lavoro/Clienti URL points at. */
  function fromNamePath(names: string[]): Group | null {
    return resolveGroupPath(groups.value, names)
  }

  /** How deep a new sub-group of this group would be. */
  function depthOfChild(parentId?: string | null): number {
    return depthUnder(groups.value, parentId)
  }

  function canAddChild(parentId?: string | null): boolean {
    return canNestUnder(groups.value, parentId)
  }

  function rejectTooDeep(parentId?: string | null): boolean {
    if (canAddChild(parentId)) return false
    toast.add({
      title: 'Troppi livelli',
      description: `I gruppi possono annidarsi al massimo su ${MAX_GROUP_DEPTH} livelli.`,
      color: 'warning'
    })
    return true
  }

  async function createGroup(input: NewGroup): Promise<Group | null> {
    const name = input.name.trim()
    if (!name) return null
    if (rejectTooDeep(input.parentId)) return null

    const payload: Database['public']['Tables']['groups']['Insert'] = {
      name,
      parent_id: input.parentId ?? null
    }
    if (input.tone) payload.tone = input.tone
    if (input.icon) payload.icon = input.icon

    const { data, error } = await supabase.from('groups').insert(payload).select().single()

    if (error) {
      // The only expected refusal is a name already used by a sibling.
      const duplicate = error.code === '23505'
      toast.add({
        title: duplicate ? 'Nome già usato' : 'Errore creazione gruppo',
        description: duplicate
          ? `Esiste già un gruppo "${name}" allo stesso livello.`
          : error.message,
        color: duplicate ? 'warning' : 'error'
      })
      return null
    }

    if (data) {
      groups.value = [...groups.value, data]
    } else {
      await loadGroups()
    }

    return data ?? null
  }

  async function renameGroup(id: string, rawName: string): Promise<boolean> {
    const name = rawName.trim()
    const current = byId(id)
    if (!current || !name || name === current.name) return false

    const { data, error } = await supabase
      .from('groups')
      .update({ name })
      .eq('id', id)
      .select('id')

    if (error || !data || data.length === 0) {
      toast.add({
        title: 'Gruppo non rinominato',
        description: error?.message ?? 'Puoi rinominare solo i tuoi gruppi.',
        color: 'error'
      })
      return false
    }

    // The database keeps the name mirrored on every activity, note and grant; here
    // only the tree changes.
    groups.value = groups.value.map(group => (group.id === id ? { ...group, name } : group))
    return true
  }

  /** Colour and icon of a group (moved here from the per-device preferences). */
  async function setGroupLook(id: string, look: { tone?: string, icon?: string }): Promise<boolean> {
    const current = byId(id)
    if (!current) return false

    const payload: Database['public']['Tables']['groups']['Update'] = {
      tone: look.tone ?? current.tone,
      icon: look.icon ?? current.icon
    }

    groups.value = groups.value.map(group => (group.id === id ? { ...group, ...payload } : group))

    const { data, error } = await supabase.from('groups').update(payload).eq('id', id).select('id')

    if (error || !data || data.length === 0) {
      groups.value = groups.value.map(group => (group.id === id ? current : group))
      toast.add({
        title: 'Aspetto non salvato',
        description: error?.message ?? 'Puoi modificare solo i tuoi gruppi.',
        color: 'error'
      })
      return false
    }

    return true
  }

  /** Move a group (and its sub-tree, which the database carries with it). */
  async function moveGroup(id: string, parentId: string | null): Promise<boolean> {
    const current = byId(id)
    if (!current || (current.parent_id ?? null) === parentId) return false
    if (rejectTooDeep(parentId)) return false

    const { data, error } = await supabase
      .from('groups')
      .update({ parent_id: parentId })
      .eq('id', id)
      .select('id')

    if (error || !data || data.length === 0) {
      const cycle = error?.message?.includes('ancestor') ?? false
      toast.add({
        title: 'Gruppo non spostato',
        description: cycle
          ? 'Un gruppo non può finire dentro un suo sottogruppo.'
          : error?.message ?? 'Puoi spostare solo i tuoi gruppi.',
        color: 'error'
      })
      return false
    }

    // Paths and depths of the whole sub-tree are recomputed by the database.
    await loadGroups()
    return true
  }

  /**
   * Delete a group. Its sub-groups go with it and the activities inside land back in
   * "Generale" — both done by the database, so this only has to refresh.
   */
  async function removeGroup(id: string): Promise<boolean> {
    const current = byId(id)
    if (!current) return false

    const { data, error } = await supabase.from('groups').delete().eq('id', id).select('id')

    if (error || !data || data.length === 0) {
      toast.add({
        title: 'Gruppo non eliminato',
        description: error?.message ?? 'Puoi eliminare solo i tuoi gruppi.',
        color: 'error'
      })
      return false
    }

    // The delete cascaded through the sub-tree, so the cache is not a row to splice
    // out: re-read the tree, or every picker and card keeps listing the group until
    // the next full load.
    await loadGroups()
    return true
  }

  /**
   * Bring the groups that used to live in the preferences cookie into the tree.
   *
   * Before groups were rows, a user's own groups were a list in a per-device cookie and
   * their colours were a second list next to it. This runs once (it clears the cookie
   * keys as it reads them), creates the missing groups and applies the colours that
   * were saved for them — so nobody loses the groups they had made.
   */
  async function migrateLegacyGroupPrefs(): Promise<number> {
    const legacy = takeLegacyGroupState()
    const styles = Object.keys(legacy.styles)
    if (legacy.names.length === 0 && styles.length === 0) return 0

    let created = 0
    for (const name of legacy.names) {
      const exists = groups.value.some(group =>
        group.parent_id === null && group.name.toLowerCase() === name.toLowerCase()
      )
      if (exists) continue

      const group = await createGroup({ name, ...(legacy.styles[name] ?? {}) })
      if (group) created++
    }

    // A colour saved for a name that already had a row (a preset, say) is applied to
    // it — the name is what the cookie knew.
    for (const [name, look] of Object.entries(legacy.styles)) {
      const target = groups.value.find(group =>
        isOwn(group) && group.name.toLowerCase() === name.toLowerCase()
      )
      if (target) await setGroupLook(target.id, look)
    }

    return created
  }

  return {
    groups,
    loading,
    tree,
    flat,
    groupsById,
    ownGroups,
    loadGroups,
    byId,
    isOwn,
    namePath,
    fromNamePath,
    depthOfChild,
    canAddChild,
    createGroup,
    renameGroup,
    setGroupLook,
    moveGroup,
    removeGroup,
    migrateLegacyGroupPrefs
  }
}
