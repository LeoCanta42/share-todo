import type { Database } from '~/types/database.types'
import type { NoteWithGroup } from '~/types/note'
import { useShares } from '~/composables/useShares'
import { useGroups } from '~/composables/useGroups'
import { offlineStorage } from '~/utils/offlineStorage'
import { useOfflineSync } from '~/composables/useOfflineSync'
import { isNetworkError } from '~/utils/network'

export interface NoteStats {
  total: number
  groups: number
}

/** The columns the list needs from an embedded group. */
const GROUP_COLUMNS = 'id, name, parent_id, path, depth, tone, icon'

/**
 * Notes.
 *
 * A note lives in a group and carries a `user_id`.
 * Fully supported for offline viewing and offline mutations with automatic sync.
 */
export function useNotes() {
  const supabase = useNuxtApp().$supabase?.client as ReturnType<typeof useSupabaseClient<Database>> | undefined
    ?? useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const { permissionFor } = useShares()
  const { groupsById } = useGroups()
  const { enqueueMutation, removeMutationsForTempId } = useOfflineSync()
  const toast = useToast()

  const initialNotes = import.meta.client && !offlineStorage.isLoggedOut()
    ? offlineStorage.getNotes()
    : []

  const notes = useState<NoteWithGroup[]>('notes-list', () => initialNotes)
  const loading = useState<boolean>('notes-loading', () => false)
  const isSaving = useState<boolean>('notes-is-saving', () => false)
  const activeActionId = useState<number | null>('notes-active-id', () => null)

  // Hydrate client-side if needed
  if (import.meta.client && !offlineStorage.isLoggedOut() && notes.value.length === 0) {
    const cached = offlineStorage.getNotes()
    if (cached.length > 0) {
      notes.value = cached
    }
  }

  async function loadNotes() {
    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = offlineStorage.getNotes()
      if (cached.length > 0) {
        notes.value = cached
      }
      return
    }

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('notes')
        .select(`*, group:groups(${GROUP_COLUMNS})`)
        .order('created_at', { ascending: false }) as unknown as {
          data: NoteWithGroup[] | null
          error: { message: string } | null
        }

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching notes:', error)
          toast.add({
            title: 'Errore nel caricamento',
            description: error.message || 'Impossibile caricare le note',
            color: 'error'
          })
        }
        const cached = offlineStorage.getNotes()
        if (cached.length > 0) {
          notes.value = cached
        }
        return
      }

      const tempNotes = notes.value.filter(n => n.id < 0)
      const serverNotes = data ?? []
      notes.value = [...tempNotes, ...serverNotes.filter(sn => !tempNotes.some(tn => tn.id === sn.id))]
      offlineStorage.setNotes(notes.value)
    } catch (err: unknown) {
      if (!isNetworkError(err)) {
        console.error('Unexpected error loading notes:', err)
      }
      const cached = offlineStorage.getNotes()
      if (cached.length > 0) {
        notes.value = cached
      }
    } finally {
      loading.value = false
    }
  }

  function patch(id: number, changes: Partial<NoteWithGroup>) {
    notes.value = notes.value.map(note => (note.id === id ? { ...note, ...changes } : note))
  }

  function restore(id: number, snapshot: NoteWithGroup | undefined) {
    if (snapshot) {
      notes.value = notes.value.map(note => (note.id === id ? snapshot : note))
    }
  }

  function notPermitted(action: string) {
    toast.add({
      title: 'Modifica non consentita',
      description: `${action}: la nota è condivisa in sola lettura oppure non è più accessibile.`,
      color: 'warning'
    })
  }

  function addOfflineNote(title: string, rawBody: string, groupId: string | null): boolean {
    const tempId = -Date.now()
    const targetGroup = groupId ? groupsById.value.get(groupId) : null

    const tempNote: NoteWithGroup = {
      id: tempId,
      title,
      body: rawBody,
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: userId.value
    }

    notes.value = [tempNote, ...notes.value.filter(n => n.id !== tempId)]
    offlineStorage.setNotes(notes.value)

    enqueueMutation({
      type: 'note:insert',
      tempId,
      payload: {
        title,
        body: rawBody,
        group_id: groupId ?? null,
        user_id: userId.value
      }
    })

    toast.add({
      title: 'Nota creata (offline)',
      description: `"${title}" salvata localmente. Verrà sincronizzata online.`,
      color: 'info'
    })

    return true
  }

  async function addNote(
    rawTitle: string,
    rawBody: string,
    groupId: string | null
  ): Promise<boolean> {
    const title = rawTitle.trim()
    if (!title) return false

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      return addOfflineNote(title, rawBody, groupId)
    }

    isSaving.value = true
    try {
      const payload: Database['public']['Tables']['notes']['Insert'] = {
        title,
        body: rawBody,
        group_id: groupId
      }

      if (userId.value) {
        payload.user_id = userId.value
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
        if (isNetworkError(error)) {
          return addOfflineNote(title, rawBody, groupId)
        }
        toast.add({
          title: 'Errore inserimento',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (data) {
        notes.value = [data, ...notes.value.filter(note => note.id !== data.id)]
        offlineStorage.setNotes(notes.value)
      } else {
        await loadNotes()
      }

      toast.add({
        title: 'Nota creata',
        description: `"${title}" aggiunta in "${data?.group_name ?? 'Generale'}"`,
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        return addOfflineNote(title, rawBody, groupId)
      }
      console.error('Error adding note:', err)
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function updateNote(
    id: number,
    changes: { title?: string; body?: string; group_id?: string | null }
  ): Promise<boolean> {
    const snapshot = notes.value.find(note => note.id === id)
    if (!snapshot) return false

    const payload: Database['public']['Tables']['notes']['Update'] = {}

    if (changes.title !== undefined) {
      const title = changes.title.trim()
      if (title && title !== snapshot.title) {
        payload.title = title
      }
    }
    if (changes.body !== undefined && changes.body !== snapshot.body) {
      payload.body = changes.body
    }
    if (changes.group_id !== undefined && (changes.group_id ?? null) !== (snapshot.group_id ?? null)) {
      payload.group_id = changes.group_id
      const targetGroup = changes.group_id ? groupsById.value.get(changes.group_id) : null
      if (targetGroup) {
        (payload as any).group_name = targetGroup.name
        ;(payload as any).group = {
          id: targetGroup.id,
          name: targetGroup.name,
          parent_id: targetGroup.parent_id,
          path: targetGroup.path,
          depth: targetGroup.depth,
          tone: targetGroup.tone,
          icon: targetGroup.icon
        }
      } else if (changes.group_id === null) {
        (payload as any).group_name = 'Generale'
        ;(payload as any).group = null
      }
    }

    if (Object.keys(payload).length === 0) return true

    patch(id, payload as Partial<NoteWithGroup>)
    offlineStorage.setNotes(notes.value)

    if (id < 0 || (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueMutation({
        type: 'note:update',
        targetId: id,
        payload: {
          title: payload.title,
          body: payload.body,
          group_id: payload.group_id
        }
      })
      toast.add({ title: 'Nota aggiornata (offline)', color: 'info' })
      return true
    }

    activeActionId.value = id
    try {
      const { data, error } = await supabase
        .from('notes')
        .update({
          title: payload.title,
          body: payload.body,
          group_id: payload.group_id
        })
        .eq('id', id)
        .select(`*, group:groups(${GROUP_COLUMNS})`) as unknown as {
          data: NoteWithGroup[] | null
          error: { message: string } | null
        }

      if (error) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'note:update',
            targetId: id,
            payload: {
              title: payload.title,
              body: payload.body,
              group_id: payload.group_id
            }
          })
          toast.add({ title: 'Nota aggiornata (offline)', color: 'info' })
          return true
        }
        restore(id, snapshot)
        offlineStorage.setNotes(notes.value)
        toast.add({
          title: 'Errore modifica',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (!data || data.length === 0) {
        restore(id, snapshot)
        offlineStorage.setNotes(notes.value)
        notPermitted('Modifica non salvata')
        return false
      }

      patch(id, data[0]!)
      offlineStorage.setNotes(notes.value)
      toast.add({ title: 'Nota aggiornata', color: 'success' })
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'note:update',
          targetId: id,
          payload: {
            title: payload.title,
            body: payload.body,
            group_id: payload.group_id
          }
        })
        toast.add({ title: 'Nota aggiornata (offline)', color: 'info' })
        return true
      }
      console.error('Error updating note:', err)
      restore(id, snapshot)
      offlineStorage.setNotes(notes.value)
      return false
    } finally {
      activeActionId.value = null
    }
  }

  async function deleteNote(id: number): Promise<boolean> {
    const target = notes.value.find(note => note.id === id)
    const snapshot = [...notes.value]

    activeActionId.value = id
    notes.value = notes.value.filter(note => note.id !== id)
    offlineStorage.setNotes(notes.value)

    if (id < 0) {
      removeMutationsForTempId(id)
      toast.add({
        title: 'Nota eliminata',
        description: target ? `"${target.title}" è stata rimossa` : undefined,
        color: 'neutral'
      })
      activeActionId.value = null
      return true
    }

    if (import.meta.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueMutation({
        type: 'note:delete',
        targetId: id
      })
      toast.add({
        title: 'Nota eliminata (offline)',
        description: target ? `"${target.title}" è stata rimossa` : undefined,
        color: 'neutral'
      })
      activeActionId.value = null
      return true
    }

    try {
      const { data, error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) {
        if (isNetworkError(error)) {
          enqueueMutation({
            type: 'note:delete',
            targetId: id
          })
          toast.add({
            title: 'Nota eliminata (offline)',
            description: target ? `"${target.title}" è stata rimossa` : undefined,
            color: 'neutral'
          })
          return true
        }
        notes.value = snapshot
        offlineStorage.setNotes(notes.value)
        toast.add({
          title: 'Errore eliminazione',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (!data || data.length === 0) {
        notes.value = snapshot
        offlineStorage.setNotes(notes.value)
        notPermitted('Eliminazione non eseguita')
        return false
      }

      toast.add({
        title: 'Nota eliminata',
        description: target ? `"${target.title}" è stata rimossa` : undefined,
        color: 'neutral'
      })
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'note:delete',
          targetId: id
        })
        toast.add({
          title: 'Nota eliminata (offline)',
          description: target ? `"${target.title}" è stata rimossa` : undefined,
          color: 'neutral'
        })
        return true
      }
      notes.value = snapshot
      offlineStorage.setNotes(notes.value)
      console.error('Error deleting note:', err)
      return false
    } finally {
      activeActionId.value = null
    }
  }

  function isShared(note: NoteWithGroup): boolean {
    const id = userId.value
    if (!id) return false
    return Boolean(note.user_id && note.user_id !== id)
  }

  function notePermission(note: NoteWithGroup) {
    return permissionFor(note)
  }

  const noteCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const note of notes.value) {
      const id = note.group_id
      if (!id) continue
      counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  })

  const noteCountsDeep = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const note of notes.value) {
      const group = note.group
      if (!group) continue
      for (const ancestorId of group.path) {
        counts[ancestorId] = (counts[ancestorId] ?? 0) + 1
      }
    }
    return counts
  })

  const stats = computed<NoteStats>(() => ({
    total: notes.value.length,
    groups: Object.keys(noteCounts.value).length
  }))

  return {
    notes,
    loading,
    isSaving,
    activeActionId,
    noteCounts,
    noteCountsDeep,
    stats,
    isShared,
    notePermission,
    loadNotes,
    addNote,
    updateNote,
    deleteNote
  }
}
