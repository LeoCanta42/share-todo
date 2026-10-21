import type { Database } from '~/types/database.types'
import type { NoteWithGroup } from '~/types/note'
import { useShares } from '~/composables/useShares'
import { useGroups } from '~/composables/useGroups'
import {
  getCachedNotes,
  setCachedNotes,
  putCachedNote,
  removeCachedNote
} from '~/utils/offlineDb'
import { useSyncEngine, isNetworkError } from '~/composables/useSyncEngine'

export interface NoteStats {
  total: number
  groups: number
}

/** The columns the list needs from an embedded group. */
const GROUP_COLUMNS = 'id, name, parent_id, path, depth, tone, icon'

/**
 * Notes.
 *
 * Deliberately the same shape as `useTodos`: a note lives in a group and carries a
 * `user_id`, so it inherits both the group sharing (a grant on `Lavoro` covers
 * `Lavoro/Clienti` for notes exactly as it does for activities — one policy function
 * decides both) and the optimistic-update/refusal handling below.
 */
export function useNotes() {
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const { permissionFor } = useShares()
  const { groupsById } = useGroups()
  const { isOnline, enqueue, cancelPendingForEntity } = useSyncEngine()
  const toast = useToast()

  const notes = useState<NoteWithGroup[]>('notes-list', () => [])
  const loading = useState<boolean>('notes-loading', () => false)
  const isSaving = useState<boolean>('notes-is-saving', () => false)
  const activeActionId = useState<number | null>('notes-active-id', () => null)

  async function loadNotes() {
    // Immediate populate from local IndexedDB cache if state is currently empty
    if (import.meta.client && notes.value.length === 0) {
      try {
        const cached = await getCachedNotes()
        if (cached && cached.length > 0 && notes.value.length === 0) {
          notes.value = cached
        }
      } catch (err) {
        console.warn('Failed to load cached notes:', err)
      }
    }

    if (!isOnline.value) {
      loading.value = false
      return
    }

    loading.value = true
    try {
      // The embedded group is what the rows display and what permissions are
      // resolved against; the generated types do not know the relationship yet, so
      // the result is narrowed here (see `database.types.ts`).
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
        return
      }

      // Preserve local un-synced negative ID items that are still in memory
      const pendingLocal = notes.value.filter(n => n.id < 0)
      const fetched = data ?? []
      notes.value = [...pendingLocal, ...fetched.filter(f => !pendingLocal.some(p => p.id === f.id))]

      if (import.meta.client) {
        await setCachedNotes(notes.value)
      }
    } catch (err: unknown) {
      if (!isNetworkError(err)) {
        console.error('Unexpected error loading notes:', err)
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

  /**
   * Postgres filters out rows a policy forbids instead of raising, so a write that
   * touched nothing *is* a refusal — see the same note in `useTodos`.
   */
  function notPermitted(action: string) {
    toast.add({
      title: 'Modifica non consentita',
      description: `${action}: la nota è condivisa in sola lettura oppure non è più accessibile.`,
      color: 'warning'
    })
  }

  async function addNote(
    rawTitle: string,
    rawBody: string,
    groupId: string | null
  ): Promise<boolean> {
    const title = rawTitle.trim()
    if (!title) return false

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

      // Offline creation: immediate local store & sync queue
      if (!isOnline.value) {
        const tempId = -1 * (Date.now() + Math.floor(Math.random() * 1000))
        const matchedGroup = groupId ? (groupsById.value.get(groupId) ?? null) : null
        const offlineNote: NoteWithGroup = {
          id: tempId,
          title,
          body: rawBody,
          group_id: groupId,
          group: matchedGroup,
          group_name: matchedGroup?.name ?? 'Generale',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: payload.user_id ?? null
        }

        notes.value = [offlineNote, ...notes.value]
        if (import.meta.client) {
          await putCachedNote(offlineNote)
          await enqueue('create_note', 'note', tempId, payload)
        }

        toast.add({
          title: 'Nota creata (offline)',
          description: `"${title}" salvata in locale, verrà sincronizzata appena online.`,
          color: 'neutral'
        })
        return true
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
          const tempId = -1 * (Date.now() + Math.floor(Math.random() * 1000))
          const matchedGroup = groupId ? (groupsById.value.get(groupId) ?? null) : null
          const offlineNote: NoteWithGroup = {
            id: tempId,
            title,
            body: rawBody,
            group_id: groupId,
            group: matchedGroup,
            group_name: matchedGroup?.name ?? 'Generale',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: payload.user_id ?? null
          }

          notes.value = [offlineNote, ...notes.value]
          if (import.meta.client) {
            await putCachedNote(offlineNote)
            await enqueue('create_note', 'note', tempId, payload)
          }

          toast.add({
            title: 'Salvata in locale (offline)',
            description: `"${title}" salvata in locale: verrà sincronizzata appena online.`,
            color: 'neutral'
          })
          return true
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
        if (import.meta.client) {
          await putCachedNote(data)
        }
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
        const tempId = -1 * (Date.now() + Math.floor(Math.random() * 1000))
        const matchedGroup = groupId ? (groupsById.value.get(groupId) ?? null) : null
        const offlineNote: NoteWithGroup = {
          id: tempId,
          title,
          body: rawBody,
          group_id: groupId,
          group: matchedGroup,
          group_name: matchedGroup?.name ?? 'Generale',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: userId.value
        }

        notes.value = [offlineNote, ...notes.value]
        if (import.meta.client) {
          await putCachedNote(offlineNote)
          await enqueue('create_note', 'note', tempId, {
            title,
            body: rawBody,
            group_id: groupId,
            user_id: userId.value
          })
        }

        toast.add({
          title: 'Salvata in locale (offline)',
          description: `"${title}" salvata in locale: verrà sincronizzata appena online.`,
          color: 'neutral'
        })
        return true
      }
      console.error('Error adding note:', err)
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function updateNote(
    id: number,
    changes: { title?: string, body?: string, group_id?: string | null }
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
    }

    if (Object.keys(payload).length === 0) return true

    patch(id, payload as Partial<NoteWithGroup>)
    const updated = { ...snapshot, ...payload }
    if (import.meta.client) {
      await putCachedNote(updated)
    }

    if (!isOnline.value || id < 0) {
      await enqueue('update_note', 'note', id, payload)
      toast.add({ title: 'Nota aggiornata (offline)', color: 'neutral' })
      return true
    }

    activeActionId.value = id
    try {
      const { data, error } = await supabase
        .from('notes')
        .update(payload)
        .eq('id', id)
        .select(`*, group:groups(${GROUP_COLUMNS})`) as unknown as {
          data: NoteWithGroup[] | null
          error: { message: string } | null
        }

      if (error) {
        if (isNetworkError(error)) {
          await enqueue('update_note', 'note', id, payload)
          toast.add({ title: 'Nota aggiornata (offline)', color: 'neutral' })
          return true
        }
        restore(id, snapshot)
        if (import.meta.client) await putCachedNote(snapshot)
        toast.add({
          title: 'Errore modifica',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (!data || data.length === 0) {
        restore(id, snapshot)
        if (import.meta.client) await putCachedNote(snapshot)
        notPermitted('Modifica non salvata')
        return false
      }

      // The database derives the mirrored name, so take the row it returned.
      patch(id, data[0]!)
      if (import.meta.client) await putCachedNote(data[0]!)
      toast.add({ title: 'Nota aggiornata', color: 'success' })
      return true
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        await enqueue('update_note', 'note', id, payload)
        toast.add({ title: 'Nota aggiornata (offline)', color: 'neutral' })
        return true
      }
      console.error('Error updating note:', err)
      restore(id, snapshot)
      if (import.meta.client) await putCachedNote(snapshot)
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
    if (import.meta.client) {
      await removeCachedNote(id)
    }

    if (id < 0) {
      await cancelPendingForEntity(id)
      activeActionId.value = null
      toast.add({
        title: 'Nota eliminata',
        description: target ? `"${target.title}" è stata rimossa` : undefined,
        color: 'neutral'
      })
      return true
    }

    if (!isOnline.value) {
      await enqueue('delete_note', 'note', id, { id })
      activeActionId.value = null
      toast.add({
        title: 'Nota eliminata (offline)',
        description: target ? `"${target.title}" rimossa localmente` : undefined,
        color: 'neutral'
      })
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
          await enqueue('delete_note', 'note', id, { id })
          return true
        }
        notes.value = snapshot
        if (import.meta.client) await setCachedNotes(snapshot)
        toast.add({
          title: 'Errore eliminazione',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (!data || data.length === 0) {
        notes.value = snapshot
        if (import.meta.client) await setCachedNotes(snapshot)
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
        await enqueue('delete_note', 'note', id, { id })
        return true
      }
      notes.value = snapshot
      if (import.meta.client) await setCachedNotes(snapshot)
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

  /** Same grant lookup the todo rows use — notes share the group permissions. */
  function notePermission(note: NoteWithGroup) {
    return permissionFor(note)
  }

  /** How many notes each group holds, by group id. */
  const noteCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const note of notes.value) {
      const id = note.group_id
      if (!id) continue
      counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  })

  /**
   * The same counts, but a group also carries what its sub-groups hold — that is the
   * number worth showing on a parent's card.
   */
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
