import type { Database } from '~/types/database.types'
import {
  getSyncQueue,
  addSyncQueueItem,
  removeSyncQueueItem,
  clearSyncQueue,
  removeSyncQueueItemsForEntity,
  getLastSyncTime,
  setLastSyncTime,
  setCachedTodos,
  getCachedTodos,
  setCachedNotes,
  getCachedNotes,
  putCachedTodo,
  putCachedNote,
  removeCachedTodo,
  removeCachedNote,
  type SyncQueueItem,
  type SyncActionType,
  type SyncEntityType
} from '~/utils/offlineDb'

export function isNetworkError(err: unknown): boolean {
  if (!err) return false
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true

  const msg = (err as any)?.message || String(err)
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('network error') ||
    msg.includes('Load failed') ||
    msg.includes('AbortError') ||
    msg.includes('connection refused') ||
    msg.includes('timeout')
  )
}

export function useSyncEngine() {
  const supabase = useSupabaseClient<Database>()
  const toast = useToast()

  const isOnline = useState<boolean>('sync-is-online', () => {
    if (import.meta.client && typeof navigator !== 'undefined') {
      return navigator.onLine
    }
    return true
  })

  const isSyncing = useState<boolean>('sync-is-syncing', () => false)
  const pendingCount = useState<number>('sync-pending-count', () => 0)
  const lastSyncTime = useState<number | null>('sync-last-timestamp', () => null)

  async function refreshPendingCount() {
    if (!import.meta.client) return
    try {
      const queue = await getSyncQueue()
      pendingCount.value = queue.length
    } catch {
      pendingCount.value = 0
    }
  }

  async function initSyncEngine() {
    if (!import.meta.client) return

    // Update initial network status
    isOnline.value = navigator.onLine

    // Listen to browser network events
    window.addEventListener('online', () => {
      isOnline.value = true
      toast.add({
        title: 'Connessione ripristinata',
        description: 'Sei di nuovo online. Avvio sincronizzazione...',
        color: 'success',
        duration: 3500
      })
      sync()
    })

    window.addEventListener('offline', () => {
      isOnline.value = false
      toast.add({
        title: 'Sei offline',
        description: 'Tutte le modifiche verranno memorizzate in locale e sincronizzate appena tornerai online.',
        color: 'neutral',
        duration: 4000
      })
    })

    // Load last sync timestamp and initial pending count
    try {
      lastSyncTime.value = await getLastSyncTime()
      await refreshPendingCount()
    } catch (err) {
      console.warn('[useSyncEngine] init error:', err)
    }
  }

  /**
   * Add an action to the sync queue and update pending count.
   */
  async function enqueue(
    type: SyncActionType,
    entity: SyncEntityType,
    entityId: string | number | undefined,
    payload: any
  ): Promise<SyncQueueItem> {
    const item = await addSyncQueueItem({
      type,
      entity,
      entityId,
      payload
    })
    await refreshPendingCount()

    // If online, trigger background sync attempt
    if (isOnline.value && !isSyncing.value) {
      setTimeout(() => {
        sync().catch(err => console.warn('[useSyncEngine] auto-sync error:', err))
      }, 500)
    }

    return item
  }

  /**
   * Cancel and remove any pending sync queue items for a local entity.
   */
  async function cancelPendingForEntity(entityId: string | number) {
    await removeSyncQueueItemsForEntity(entityId)
    await refreshPendingCount()
  }

  /**
   * Main sync processor: drains the queue in chronological order.
   */
  async function sync(): Promise<{ success: boolean, syncedCount: number, error?: string }> {
    if (!import.meta.client) return { success: false, syncedCount: 0 }
    if (isSyncing.value) return { success: false, syncedCount: 0 }

    if (!navigator.onLine) {
      isOnline.value = false
      return { success: false, syncedCount: 0, error: 'Offline' }
    }

    isSyncing.value = true
    let syncedCount = 0

    try {
      const queue = await getSyncQueue()
      if (queue.length === 0) {
        pendingCount.value = 0
        lastSyncTime.value = Date.now()
        await setLastSyncTime(lastSyncTime.value)
        return { success: true, syncedCount: 0 }
      }

      // Maps temporary IDs (e.g. negative integers) to server-assigned real IDs
      const idMap = new Map<number | string, number | string>()

      for (const item of queue) {
        try {
          const resolvedEntityId = item.entityId !== undefined && idMap.has(item.entityId)
            ? idMap.get(item.entityId)!
            : item.entityId

          switch (item.type) {
            case 'create_todo': {
              const payload = { ...item.payload }
              // Remove temporary ID so database generates real identity
              delete payload.id

              // Resolve group_id if it was remapped
              if (payload.group_id && idMap.has(payload.group_id)) {
                payload.group_id = idMap.get(payload.group_id)
              }

              const { data, error } = await supabase
                .from('todos')
                .insert(payload)
                .select('*, group:groups(id, name, parent_id, path, depth, tone, icon)')
                .single()

              if (error) throw error

              if (data && item.entityId !== undefined) {
                const realId = data.id
                idMap.set(item.entityId, realId)

                // Update in local cache
                const todos = await getCachedTodos()
                const updatedTodos = todos.map(t => (t.id === item.entityId ? (data as any) : t))
                await setCachedTodos(updatedTodos)

                // Update active Vue state if present
                const activeTodos = useState<any[]>('todos-list')
                if (activeTodos.value) {
                  activeTodos.value = activeTodos.value.map(t => (t.id === item.entityId ? data : t))
                }
              }
              break
            }

            case 'update_todo': {
              const targetId = resolvedEntityId as number
              const changes = { ...item.payload }
              if (changes.group_id && idMap.has(changes.group_id)) {
                changes.group_id = idMap.get(changes.group_id)
              }

              const { error } = await supabase
                .from('todos')
                .update(changes)
                .eq('id', targetId)

              if (error) throw error
              break
            }

            case 'delete_todo': {
              const targetId = resolvedEntityId as number
              // If target was temporary and never inserted on server, nothing to delete on server
              if (typeof targetId === 'number' && targetId < 0) {
                break
              }

              const { error } = await supabase
                .from('todos')
                .delete()
                .eq('id', targetId)

              if (error) throw error
              break
            }

            case 'toggle_todos': {
              const ids: number[] = (item.payload.ids || []).map((id: number) =>
                (idMap.has(id) ? (idMap.get(id) as number) : id)
              ).filter((id: number) => id > 0)

              if (ids.length > 0) {
                const { error } = await supabase
                  .from('todos')
                  .update({ completed: item.payload.completed })
                  .in('id', ids)

                if (error) throw error
              }
              break
            }

            case 'clear_completed_todos': {
              const ids: number[] = (item.payload.ids || []).map((id: number) =>
                (idMap.has(id) ? (idMap.get(id) as number) : id)
              ).filter((id: number) => id > 0)

              if (ids.length > 0) {
                const { error } = await supabase
                  .from('todos')
                  .delete()
                  .in('id', ids)

                if (error) throw error
              }
              break
            }

            case 'create_note': {
              const payload = { ...item.payload }
              delete payload.id

              if (payload.group_id && idMap.has(payload.group_id)) {
                payload.group_id = idMap.get(payload.group_id)
              }

              const { data, error } = await supabase
                .from('notes')
                .insert(payload)
                .select('*, group:groups(id, name, parent_id, path, depth, tone, icon)')
                .single()

              if (error) throw error

              if (data && item.entityId !== undefined) {
                const realId = data.id
                idMap.set(item.entityId, realId)

                // Update in local cache
                const notes = await getCachedNotes()
                const updatedNotes = notes.map(n => (n.id === item.entityId ? (data as any) : n))
                await setCachedNotes(updatedNotes)

                // Update active Vue state if present
                const activeNotes = useState<any[]>('notes-list')
                if (activeNotes.value) {
                  activeNotes.value = activeNotes.value.map(n => (n.id === item.entityId ? data : n))
                }
              }
              break
            }

            case 'update_note': {
              const targetId = resolvedEntityId as number
              const changes = { ...item.payload }
              if (changes.group_id && idMap.has(changes.group_id)) {
                changes.group_id = idMap.get(changes.group_id)
              }

              const { error } = await supabase
                .from('notes')
                .update(changes)
                .eq('id', targetId)

              if (error) throw error
              break
            }

            case 'delete_note': {
              const targetId = resolvedEntityId as number
              if (typeof targetId === 'number' && targetId < 0) {
                break
              }

              const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', targetId)

              if (error) throw error
              break
            }

            case 'create_group': {
              const payload = { ...item.payload }
              if (payload.parent_id && idMap.has(payload.parent_id)) {
                payload.parent_id = idMap.get(payload.parent_id)
              }

              const { data, error } = await supabase
                .from('groups')
                .insert(payload)
                .select('*')
                .single()

              if (error) throw error
              if (data && item.entityId !== undefined && item.entityId !== data.id) {
                idMap.set(item.entityId, data.id)
              }
              break
            }

            case 'rename_group': {
              const groupId = String(resolvedEntityId)
              const { error } = await supabase
                .from('groups')
                .update({ name: item.payload.name })
                .eq('id', groupId)

              if (error) throw error
              break
            }

            case 'set_group_look': {
              const groupId = String(resolvedEntityId)
              const { error } = await supabase
                .from('groups')
                .update(item.payload)
                .eq('id', groupId)

              if (error) throw error
              break
            }

            case 'move_group': {
              const groupId = String(resolvedEntityId)
              const parentId = item.payload.parent_id && idMap.has(item.payload.parent_id)
                ? idMap.get(item.payload.parent_id)
                : item.payload.parent_id

              const { error } = await supabase
                .from('groups')
                .update({ parent_id: parentId })
                .eq('id', groupId)

              if (error) throw error
              break
            }

            case 'delete_group': {
              const groupId = String(resolvedEntityId)
              const { error } = await supabase
                .from('groups')
                .delete()
                .eq('id', groupId)

              if (error) throw error
              break
            }
          }

          // Successfully processed item: remove from queue
          await removeSyncQueueItem(item.id)
          syncedCount++
        } catch (itemError: any) {
          console.error(`[useSyncEngine] Failed sync item ${item.type} (${item.id}):`, itemError)

          if (isNetworkError(itemError)) {
            // Connection dropped during sync: stop draining the queue and leave rest for later
            isOnline.value = false
            return { success: false, syncedCount, error: 'Connessione interrotta durante la sincronizzazione' }
          }

          // Permanent error (e.g., policy refusal, deleted item, invalid schema)
          // Remove to avoid deadlock on future syncs
          await removeSyncQueueItem(item.id)
          toast.add({
            title: 'Sincronizzazione parziale',
            description: `Un'operazione (${item.type}) non è stata accettata dal server: ${itemError?.message || 'Permesso negato'}.`,
            color: 'warning'
          })
        }
      }

      lastSyncTime.value = Date.now()
      await setLastSyncTime(lastSyncTime.value)
      await refreshPendingCount()

      if (syncedCount > 0) {
        toast.add({
          title: 'Sincronizzazione completata',
          description: `${syncedCount} ${syncedCount === 1 ? 'modifica sincronizzata' : 'modifiche sincronizzate'} con successo.`,
          color: 'success',
          duration: 3000
        })
      }

      return { success: true, syncedCount }
    } catch (err: any) {
      console.error('[useSyncEngine] Unexpected sync failure:', err)
      return { success: false, syncedCount, error: err?.message }
    } finally {
      isSyncing.value = false
      await refreshPendingCount()
    }
  }

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    initSyncEngine,
    refreshPendingCount,
    enqueue,
    cancelPendingForEntity,
    sync
  }
}
