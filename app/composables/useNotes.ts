import type { Database } from '~/types/database.types'
import type { Note } from '~/types/note'
import { useShares } from '~/composables/useShares'

export interface NoteStats {
  total: number
  groups: number
}

/**
 * Notes.
 *
 * Deliberately the same shape as `useTodos`: a note carries a `group_name` and a
 * `user_id`, so it inherits both the group sharing (the RLS policies on
 * `public.notes` resolve against the same `todo_shares` rows as the todos) and the
 * optimistic-update/refusal handling below.
 */
export function useNotes() {
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const { permissionFor } = useShares()
  const toast = useToast()

  const notes = useState<Note[]>('notes-list', () => [])
  const loading = useState<boolean>('notes-loading', () => false)
  const isSaving = useState<boolean>('notes-is-saving', () => false)
  const activeActionId = useState<number | null>('notes-active-id', () => null)

  async function loadNotes() {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching notes:', error)
        toast.add({
          title: 'Errore nel caricamento',
          description: error.message || 'Impossibile caricare le note',
          color: 'error'
        })
        return
      }

      notes.value = data ?? []
    } catch (err: unknown) {
      console.error('Unexpected error loading notes:', err)
    } finally {
      loading.value = false
    }
  }

  function patch(id: number, changes: Partial<Note>) {
    notes.value = notes.value.map(n => (n.id === id ? { ...n, ...changes } : n))
  }

  function restore(id: number, snapshot: Note | undefined) {
    if (snapshot) {
      notes.value = notes.value.map(n => (n.id === id ? snapshot : n))
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

  async function addNote(rawTitle: string, rawBody: string, rawGroup: string): Promise<boolean> {
    const title = rawTitle.trim()
    if (!title) return false

    const groupName = rawGroup.trim() || 'Generale'

    isSaving.value = true
    try {
      const payload: Database['public']['Tables']['notes']['Insert'] = {
        title,
        body: rawBody,
        group_name: groupName
      }

      if (userId.value) {
        payload.user_id = userId.value
      }

      const { data, error } = await supabase
        .from('notes')
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
        notes.value = [data, ...notes.value.filter(n => n.id !== data.id)]
      } else {
        await loadNotes()
      }

      toast.add({
        title: 'Nota creata',
        description: `"${title}" aggiunta in "${groupName}"`,
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      console.error('Error adding note:', err)
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function updateNote(
    id: number,
    changes: { title?: string, body?: string, group_name?: string }
  ): Promise<boolean> {
    const snapshot = notes.value.find(n => n.id === id)
    if (!snapshot) return false

    const payload: Database['public']['Tables']['notes']['Update'] = {}

    if (changes.title !== undefined) {
      const title = changes.title.trim()
      if (!title || title === snapshot.title) {
        // Nothing to do for the title; the other fields may still differ.
      } else {
        payload.title = title
      }
    }
    if (changes.body !== undefined && changes.body !== snapshot.body) {
      payload.body = changes.body
    }
    if (changes.group_name !== undefined) {
      const group = changes.group_name.trim() || 'Generale'
      if (group !== (snapshot.group_name || 'Generale')) {
        payload.group_name = group
      }
    }

    if (Object.keys(payload).length === 0) return true

    patch(id, payload as Partial<Note>)

    activeActionId.value = id
    try {
      const { data, error } = await supabase
        .from('notes')
        .update(payload)
        .eq('id', id)
        .select('id')

      if (error) {
        restore(id, snapshot)
        toast.add({
          title: 'Errore modifica',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (!data || data.length === 0) {
        restore(id, snapshot)
        notPermitted('Modifica non salvata')
        return false
      }

      toast.add({ title: 'Nota aggiornata', color: 'success' })
      return true
    } catch (err: unknown) {
      console.error('Error updating note:', err)
      restore(id, snapshot)
      return false
    } finally {
      activeActionId.value = null
    }
  }

  async function deleteNote(id: number): Promise<boolean> {
    const target = notes.value.find(n => n.id === id)
    const snapshot = [...notes.value]

    activeActionId.value = id
    notes.value = notes.value.filter(n => n.id !== id)

    try {
      const { data, error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id)
        .select('id')

      if (error) {
        notes.value = snapshot
        toast.add({
          title: 'Errore eliminazione',
          description: error.message,
          color: 'error'
        })
        return false
      }

      if (!data || data.length === 0) {
        notes.value = snapshot
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
      notes.value = snapshot
      console.error('Error deleting note:', err)
      return false
    } finally {
      activeActionId.value = null
    }
  }

  function isShared(note: Note): boolean {
    const id = userId.value
    if (!id) return false
    return Boolean(note.user_id && note.user_id !== id)
  }

  /** Same grant lookup the todo rows use — notes share the group permissions. */
  function notePermission(note: Note) {
    return permissionFor(note)
  }

  /** How many notes each group holds, for the group cards and filter chips. */
  const noteCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const note of notes.value) {
      const name = (note.group_name || 'Generale').trim() || 'Generale'
      counts[name] = (counts[name] ?? 0) + 1
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
    stats,
    isShared,
    notePermission,
    loadNotes,
    addNote,
    updateNote,
    deleteNote
  }
}
