import type { Database } from '~/types/database.types'
import { offlineStorage, type OfflineMutation, type MutationType } from '~/utils/offlineStorage'
import { isNetworkError } from '~/utils/network'
import type { TodoWithGroup } from '~/types/todo'
import type { NoteWithGroup } from '~/types/note'
import type { Group } from '~/types/group'

const GROUP_COLUMNS = 'id, name, parent_id, path, depth, tone, icon'

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'mut_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36)
}

export function useOfflineSync() {
  const isOnline = useState<boolean>('offline:is-online', () => {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine
    }
    return true
  })

  const isSyncing = useState<boolean>('offline:is-syncing', () => false)
  const mutationQueue = useState<OfflineMutation[]>('offline:mutations', () => {
    return offlineStorage.getMutations()
  })

  const pendingCount = computed(() => mutationQueue.value.length)

  // Sync state between ref and localStorage
  function refreshQueueState() {
    mutationQueue.value = offlineStorage.getMutations()
  }

  function enqueueMutation(mutation: Omit<OfflineMutation, 'id' | 'createdAt'>): OfflineMutation {
    const fullMutation: OfflineMutation = {
      ...mutation,
      id: generateId(),
      createdAt: Date.now()
    }

    offlineStorage.addMutation(fullMutation)
    refreshQueueState()

    // If online, attempt background sync
    if (isOnline.value && !isSyncing.value) {
      processQueue().catch(err => {
        console.warn('[useOfflineSync] Error triggering sync after enqueue:', err)
      })
    }

    return fullMutation
  }

  function removeMutationsForTempId(tempId: number | string) {
    const remaining = offlineStorage.getMutations().filter(m => m.tempId !== tempId && m.targetId !== tempId)
    offlineStorage.setMutations(remaining)
    refreshQueueState()
  }

  async function processQueue(): Promise<void> {
    if (!import.meta.client) return
    if (!isOnline.value || isSyncing.value) return

    const currentQueue = offlineStorage.getMutations()
    if (currentQueue.length === 0) return

    isSyncing.value = true

    const supabase = useNuxtApp().$supabase?.client as ReturnType<typeof useSupabaseClient<Database>> | undefined
    if (!supabase) {
      isSyncing.value = false
      return
    }

    const toast = useToast()
    const todosState = useState<TodoWithGroup[]>('todos-list', () => [])
    const notesState = useState<NoteWithGroup[]>('notes-list', () => [])
    const groupsState = useState<Group[]>('groups-list', () => [])

    const idMap = new Map<number | string, number | string>()
    let processedCount = 0

    try {
      for (const mutation of currentQueue) {
        // Double check online status
        if (!navigator.onLine) {
          isOnline.value = false
          break
        }

        try {
          switch (mutation.type) {
            case 'todo:insert': {
              const payload = { ...mutation.payload }
              // Resolve group_id if it was a temporary group
              if (payload.group_id && idMap.has(payload.group_id)) {
                payload.group_id = idMap.get(payload.group_id) as string
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
                insertResult = await supabase
                  .from('todos')
                  .insert(payload)
                  .select(`*, group:groups(${GROUP_COLUMNS})`)
                  .single() as unknown as {
                    data: TodoWithGroup | null
                    error: { message: string; code?: string } | null
                  }
              }

              if (insertResult.error) {
                if (isNetworkError(insertResult.error)) {
                  throw insertResult.error
                }
                console.error('[useOfflineSync] Error syncing todo insert:', insertResult.error)
              } else if (insertResult.data && mutation.tempId) {
                idMap.set(mutation.tempId, insertResult.data.id)
                // Replace temp todo in memory
                todosState.value = todosState.value.map(t =>
                  t.id === mutation.tempId ? insertResult.data! : t
                )
                offlineStorage.setTodos(todosState.value)
              }
              break
            }

            case 'todo:update': {
              const targetId = idMap.get(mutation.targetId!) ?? mutation.targetId
              if (typeof targetId === 'number' && targetId > 0) {
                const payload = { ...mutation.payload }
                if (payload.group_id && idMap.has(payload.group_id)) {
                  payload.group_id = idMap.get(payload.group_id) as string
                }

                let { data, error } = await supabase
                  .from('todos')
                  .update(payload)
                  .eq('id', targetId)
                  .select(`*, group:groups(${GROUP_COLUMNS})`)

                if (error && (error.message.includes('reminder_at') || (error as any).code === 'PGRST204')) {
                  delete payload.reminder_at
                  const retry = await supabase
                    .from('todos')
                    .update(payload)
                    .eq('id', targetId)
                    .select(`*, group:groups(${GROUP_COLUMNS})`)
                  error = retry.error
                  data = retry.data
                }

                if (error) {
                  if (isNetworkError(error)) throw error
                  console.error('[useOfflineSync] Error syncing todo update:', error)
                } else if (data && data.length > 0) {
                  todosState.value = todosState.value.map(t => (t.id === targetId ? (data[0] as any) : t))
                  offlineStorage.setTodos(todosState.value)
                }
              }
              break
            }

            case 'todo:delete': {
              const targetId = idMap.get(mutation.targetId!) ?? mutation.targetId
              if (typeof targetId === 'number' && targetId > 0) {
                const { error } = await supabase
                  .from('todos')
                  .delete()
                  .eq('id', targetId)
                  .select('id')

                if (error) {
                  if (isNetworkError(error)) throw error
                  console.error('[useOfflineSync] Error syncing todo delete:', error)
                }
              }
              break
            }

            case 'note:insert': {
              const payload = { ...mutation.payload }
              if (payload.group_id && idMap.has(payload.group_id)) {
                payload.group_id = idMap.get(payload.group_id) as string
              }

              const { data, error } = await supabase
                .from('notes')
                .insert(payload)
                .select(`*, group:groups(${GROUP_COLUMNS})`)
                .single() as unknown as {
                  data: NoteWithGroup | null
                  error: { message: string } | null
                }

              if (error) {
                if (isNetworkError(error)) throw error
                console.error('[useOfflineSync] Error syncing note insert:', error)
              } else if (data && mutation.tempId) {
                idMap.set(mutation.tempId, data.id)
                notesState.value = notesState.value.map(n =>
                  n.id === mutation.tempId ? data : n
                )
                offlineStorage.setNotes(notesState.value)
              }
              break
            }

            case 'note:update': {
              const targetId = idMap.get(mutation.targetId!) ?? mutation.targetId
              if (typeof targetId === 'number' && targetId > 0) {
                const payload = { ...mutation.payload }
                if (payload.group_id && idMap.has(payload.group_id)) {
                  payload.group_id = idMap.get(payload.group_id) as string
                }

                const { data, error } = await supabase
                  .from('notes')
                  .update(payload)
                  .eq('id', targetId)
                  .select(`*, group:groups(${GROUP_COLUMNS})`) as unknown as {
                    data: NoteWithGroup[] | null
                    error: { message: string } | null
                  }

                if (error) {
                  if (isNetworkError(error)) throw error
                  console.error('[useOfflineSync] Error syncing note update:', error)
                } else if (data && data.length > 0) {
                  notesState.value = notesState.value.map(n => (n.id === targetId ? data[0]! : n))
                  offlineStorage.setNotes(notesState.value)
                }
              }
              break
            }

            case 'note:delete': {
              const targetId = idMap.get(mutation.targetId!) ?? mutation.targetId
              if (typeof targetId === 'number' && targetId > 0) {
                const { error } = await supabase
                  .from('notes')
                  .delete()
                  .eq('id', targetId)
                  .select('id')

                if (error) {
                  if (isNetworkError(error)) throw error
                  console.error('[useOfflineSync] Error syncing note delete:', error)
                }
              }
              break
            }

            case 'group:insert': {
              const payload = { ...mutation.payload }
              if (payload.parent_id && idMap.has(payload.parent_id)) {
                payload.parent_id = idMap.get(payload.parent_id) as string
              }

              const { data, error } = await supabase
                .from('groups')
                .insert(payload)
                .select()
                .single()

              if (error) {
                if (isNetworkError(error)) throw error
                console.error('[useOfflineSync] Error syncing group insert:', error)
              } else if (data && mutation.tempId) {
                idMap.set(mutation.tempId, data.id)
                groupsState.value = groupsState.value.map(g =>
                  g.id === mutation.tempId ? data : g
                )
                offlineStorage.setGroups(groupsState.value)
              }
              break
            }

            case 'group:update': {
              const targetId = (idMap.get(mutation.targetId!) ?? mutation.targetId) as string
              if (targetId && !targetId.startsWith('temp_')) {
                const payload = { ...mutation.payload }
                if (payload.parent_id && idMap.has(payload.parent_id)) {
                  payload.parent_id = idMap.get(payload.parent_id) as string
                }

                const { data, error } = await supabase
                  .from('groups')
                  .update(payload)
                  .eq('id', targetId)
                  .select()

                if (error) {
                  if (isNetworkError(error)) throw error
                  console.error('[useOfflineSync] Error syncing group update:', error)
                } else if (data && data.length > 0) {
                  groupsState.value = groupsState.value.map(g => (g.id === targetId ? data[0]! : g))
                  offlineStorage.setGroups(groupsState.value)
                }
              }
              break
            }

            case 'group:delete': {
              const targetId = (idMap.get(mutation.targetId!) ?? mutation.targetId) as string
              if (targetId && !targetId.startsWith('temp_')) {
                const { error } = await supabase
                  .from('groups')
                  .delete()
                  .eq('id', targetId)
                  .select('id')

                if (error) {
                  if (isNetworkError(error)) throw error
                  console.error('[useOfflineSync] Error syncing group delete:', error)
                }
              }
              break
            }
          }

          // Remove the mutation once successfully handled (or rejected non-network)
          offlineStorage.removeMutation(mutation.id)
          processedCount++
        } catch (itemError) {
          if (isNetworkError(itemError)) {
            isOnline.value = false
            break
          } else {
            console.error('[useOfflineSync] Permanent failure on mutation:', mutation, itemError)
            offlineStorage.removeMutation(mutation.id)
          }
        }
      }
    } finally {
      refreshQueueState()
      isSyncing.value = false

      if (processedCount > 0) {
        toast.add({
          title: 'Sincronizzazione completata',
          description: `${processedCount} ${processedCount === 1 ? 'modifica sincronizzata' : 'modifiche sincronizzate'} con il server.`,
          color: 'success'
        })
      }
    }
  }

  // Setup listeners on client
  if (import.meta.client) {
    const handleOnline = () => {
      isOnline.value = true
      processQueue().catch(err => {
        console.warn('[useOfflineSync] Error in handleOnline sync:', err)
      })
    }

    const handleOffline = () => {
      isOnline.value = false
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }
  }

  return {
    isOnline,
    isSyncing,
    pendingCount,
    enqueueMutation,
    removeMutationsForTempId,
    processQueue,
    refreshQueueState
  }
}
