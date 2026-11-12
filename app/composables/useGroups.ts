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
import { offlineStorage } from '~/utils/offlineStorage'
import { useOfflineSync } from '~/composables/useOfflineSync'
import { isNetworkError } from '~/utils/network'

/**
 * The group tree.
 *
 * Groups are rows now (see `supabase/schema.sql`, section 1.5), so this is the one
 * place that reads and writes them. What comes back is everything the signed-in user
 * may see: their own tree plus any branch someone shared with them.
 *
 * Group state is persisted locally so that it remains accessible and editable offline.
 */
export function useGroups() {
  const supabase = useNuxtApp().$supabase?.client as ReturnType<typeof useSupabaseClient<Database>> | undefined
    ?? useSupabaseClient<Database>()
  const toast = useToast()
  const { takeLegacyGroupState } = usePreferences()
  const { userId } = useCurrentUser()
  const { enqueueMutation, removeMutationsForTempId } = useOfflineSync()

  const initialGroups = import.meta.client && !offlineStorage.isLoggedOut()
    ? offlineStorage.getGroups()
    : []

  const groups = useState<Group[]>('groups-list', () => initialGroups)
  const loading = useState<boolean>('groups-loading', () => false)

  // Hydrate client-side if needed
  if (import.meta.client && !offlineStorage.isLoggedOut() && groups.value.length === 0) {
    const cached = offlineStorage.getGroups()
    if (cached.length > 0) {
      groups.value = cached
    }
  }

  async function loadGroups() {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = offlineStorage.getGroups()
      if (cached.length > 0) {
        groups.value = cached
      }
      return
    }

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .order('depth', { ascending: true })
        .order('name', { ascending: true })

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching groups:', error)
          toast.add({
            title: 'Errore nel caricamento',
            description: error.message || 'Impossibile caricare i gruppi',
            color: 'error'
          })
        }
        const cached = offlineStorage.getGroups()
        if (cached.length > 0) {
          groups.value = cached
        }
        return
      }

      // Preserve any local temp groups not yet synced
      const tempGroups = groups.value.filter(g => g.id.startsWith('temp_'))
      const serverGroups = data ?? []
      groups.value = [...serverGroups, ...tempGroups.filter(tg => !serverGroups.some(sg => sg.id === tg.id))]
      offlineStorage.setGroups(groups.value)
    } catch (err: unknown) {
      if (!isNetworkError(err)) {
        console.error('Unexpected error loading groups:', err)
      }
      const cached = offlineStorage.getGroups()
      if (cached.length > 0) {
        groups.value = cached
      }
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

  function createOfflineGroup(input: NewGroup, name: string): Group {
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const parent = input.parentId ? byId(input.parentId) : null
    const depth = depthOfChild(input.parentId)
    const path = parent ? [...parent.path, tempId] : [tempId]

    const data: Group = {
      id: tempId,
      name,
      parent_id: input.parentId ?? null,
      depth,
      path,
      tone: input.tone ?? 'slate',
      icon: input.icon ?? 'folder',
      owner_id: userId.value ?? '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    groups.value = [...groups.value, data]
    offlineStorage.setGroups(groups.value)

    enqueueMutation({
      type: 'group:insert',
      tempId,
      payload: {
        name,
        parent_id: input.parentId ?? null,
        tone: data.tone,
        icon: data.icon
      }
    })

    toast.add({
      title: 'Gruppo creato (offline)',
      description: `"${name}" salvato localmente. Verrà sincronizzato online.`,
      color: 'info'
    })

    return data
  }

  async function createGroup(input: NewGroup): Promise<Group | null> {
    const name = input.name.trim()
    if (!name) return null
    if (rejectTooDeep(input.parentId)) return null

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      return createOfflineGroup(input, name)
    }

    const payload: Database['public']['Tables']['groups']['Insert'] = {
      name,
      parent_id: input.parentId ?? null
    }
    if (input.tone) payload.tone = input.tone
    if (input.icon) payload.icon = input.icon

    try {
      const { data, error } = await supabase.from('groups').insert(payload).select().single()

      if (error) {
        if (isNetworkError(error)) {
          return createOfflineGroup(input, name)
        }
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
        offlineStorage.setGroups(groups.value)
      } else {
        await loadGroups()
      }

      return data ?? null
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        return createOfflineGroup(input, name)
      }
      console.error('Error creating group:', err)
      return null
    }
  }

  async function renameGroup(id: string, rawName: string): Promise<boolean> {
    const name = rawName.trim()
    const current = byId(id)
    if (!current || !name || name === current.name) return false

    // Optimistic local update
    groups.value = groups.value.map(group => (group.id === id ? { ...group, name } : group))
    offlineStorage.setGroups(groups.value)

    if (id.startsWith('temp_') || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'group:update',
        targetId: id,
        payload: { name }
      })
      toast.add({ title: 'Gruppo rinominato (offline)', color: 'info' })
      return true
    }

    try {
      const { data, error } = await supabase
        .from('groups')
        .update({ name })
        .eq('id', id)
        .select('id')

      if (error || !data || data.length === 0) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'group:update',
            targetId: id,
            payload: { name }
          })
          toast.add({ title: 'Gruppo rinominato (offline)', color: 'info' })
          return true
        }
        // Rollback
        groups.value = groups.value.map(group => (group.id === id ? current : group))
        offlineStorage.setGroups(groups.value)
        toast.add({
          title: 'Gruppo non rinominato',
          description: error?.message ?? 'Puoi rinominare solo i tuoi gruppi.',
          color: 'error'
        })
        return false
      }

      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'group:update',
          targetId: id,
          payload: { name }
        })
        toast.add({ title: 'Gruppo rinominato (offline)', color: 'info' })
        return true
      }
      groups.value = groups.value.map(group => (group.id === id ? current : group))
      offlineStorage.setGroups(groups.value)
      return false
    }
  }

  /** Colour and icon of a group. */
  async function setGroupLook(id: string, look: { tone?: string; icon?: string }): Promise<boolean> {
    const current = byId(id)
    if (!current) return false

    const payload: Database['public']['Tables']['groups']['Update'] = {
      tone: look.tone ?? current.tone,
      icon: look.icon ?? current.icon
    }

    groups.value = groups.value.map(group => (group.id === id ? { ...group, ...payload } : group))
    offlineStorage.setGroups(groups.value)

    if (id.startsWith('temp_') || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'group:update',
        targetId: id,
        payload
      })
      return true
    }

    try {
      const { data, error } = await supabase.from('groups').update(payload).eq('id', id).select('id')

      if (error || !data || data.length === 0) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'group:update',
            targetId: id,
            payload
          })
          return true
        }
        groups.value = groups.value.map(group => (group.id === id ? current : group))
        offlineStorage.setGroups(groups.value)
        toast.add({
          title: 'Aspetto non salvato',
          description: error?.message ?? 'Puoi modificare solo i tuoi gruppi.',
          color: 'error'
        })
        return false
      }

      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'group:update',
          targetId: id,
          payload
        })
        return true
      }
      groups.value = groups.value.map(group => (group.id === id ? current : group))
      offlineStorage.setGroups(groups.value)
      return false
    }
  }

  /** Move a group (and its sub-tree). */
  async function moveGroup(id: string, parentId: string | null): Promise<boolean> {
    const current = byId(id)
    if (!current || (current.parent_id ?? null) === parentId) return false
    if (rejectTooDeep(parentId)) return false

    // Optimistically update
    groups.value = groups.value.map(group => (group.id === id ? { ...group, parent_id: parentId } : group))
    offlineStorage.setGroups(groups.value)

    if (id.startsWith('temp_') || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'group:update',
        targetId: id,
        payload: { parent_id: parentId }
      })
      toast.add({ title: 'Gruppo spostato (offline)', color: 'info' })
      return true
    }

    try {
      const { data, error } = await supabase
        .from('groups')
        .update({ parent_id: parentId })
        .eq('id', id)
        .select('id')

      if (error || !data || data.length === 0) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'group:update',
            targetId: id,
            payload: { parent_id: parentId }
          })
          toast.add({ title: 'Gruppo spostato (offline)', color: 'info' })
          return true
        }
        // Rollback
        groups.value = groups.value.map(group => (group.id === id ? current : group))
        offlineStorage.setGroups(groups.value)
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

      await loadGroups()
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'group:update',
          targetId: id,
          payload: { parent_id: parentId }
        })
        toast.add({ title: 'Gruppo spostato (offline)', color: 'info' })
        return true
      }
      groups.value = groups.value.map(group => (group.id === id ? current : group))
      offlineStorage.setGroups(groups.value)
      return false
    }
  }

  /**
   * Delete a group.
   */
  async function removeGroup(id: string): Promise<boolean> {
    const current = byId(id)
    if (!current) return false

    // Optimistic removal
    groups.value = groups.value.filter(group => group.id !== id && !group.path.includes(id))
    offlineStorage.setGroups(groups.value)

    if (id.startsWith('temp_')) {
      removeMutationsForTempId(id)
      toast.add({ title: 'Gruppo rimosso', color: 'neutral' })
      return true
    }

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueMutation({
        type: 'group:delete',
        targetId: id
      })
      toast.add({ title: 'Gruppo rimosso (offline)', color: 'neutral' })
      return true
    }

    try {
      const { data, error } = await supabase.from('groups').delete().eq('id', id).select('id')

      if (error || !data || data.length === 0) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'group:delete',
            targetId: id
          })
          toast.add({ title: 'Gruppo rimosso (offline)', color: 'neutral' })
          return true
        }
        // Rollback
        await loadGroups()
        toast.add({
          title: 'Gruppo non eliminato',
          description: error?.message ?? 'Puoi eliminare solo i tuoi gruppi.',
          color: 'error'
        })
        return false
      }

      await loadGroups()
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'group:delete',
          targetId: id
        })
        toast.add({ title: 'Gruppo rimosso (offline)', color: 'neutral' })
        return true
      }
      await loadGroups()
      return false
    }
  }

  /**
   * Bring legacy preferences cookie groups into tree.
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
