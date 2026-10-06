<script setup lang="ts">
import { useNotes } from '~/composables/useNotes'
import { useTodos } from '~/composables/useTodos'
import { useConfirm } from '~/composables/useConfirm'
import { usePreferences } from '~/composables/usePreferences'
import type { Note } from '~/types/note'

/**
 * A list of notes, either for one group (`group` set — the group page) or for
 * everything (the /notes page, which then offers a group filter and a search).
 */
const props = withDefaults(defineProps<{
  /** Restrict the panel to one group; null lists every note. */
  group?: string | null
  /** Show the inline composer; the pages with a quick-add bar leave this off. */
  showComposer?: boolean
}>(), {
  group: null,
  showComposer: false
})

const { notes, loading, activeActionId, notePermission, isShared, updateNote, deleteNote } = useNotes()
const { availableGroups, groupMeta } = useTodos()
const { ask } = useConfirm()
const { prefs } = usePreferences()

const groupFilter = ref<string>('all')
const search = ref('')

const composerGroup = computed(() => props.group ?? 'Generale')

const scopedNotes = computed(() => {
  if (props.group) {
    return notes.value.filter(n => (n.group_name || 'Generale') === props.group)
  }
  return notes.value
})

const visibleNotes = computed(() => {
  let list = scopedNotes.value

  if (!props.group && groupFilter.value !== 'all') {
    list = list.filter(n => (n.group_name || 'Generale') === groupFilter.value)
  }

  const query = search.value.trim().toLowerCase()
  if (query) {
    list = list.filter(n =>
      n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query)
    )
  }

  return list
})

/** Only the groups that actually hold a note are worth offering as a filter. */
const groupsWithNotes = computed(() => {
  const set = new Set<string>()
  for (const note of scopedNotes.value) {
    set.add((note.group_name || 'Generale').trim() || 'Generale')
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))
})

const rows = computed(() => visibleNotes.value.map(note => ({
  note,
  meta: groupMeta(note.group_name),
  shared: isShared(note),
  canEdit: notePermission(note) !== 'read'
})))

/* --------------------------------------------------------------- detail view */
const isDetailOpen = ref(false)
const detailId = ref<number | null>(null)

const detailNote = computed<Note | null>(
  () => notes.value.find(n => n.id === detailId.value) ?? null
)
const detailMeta = computed(() => groupMeta(detailNote.value?.group_name))
const detailEditable = computed(() => (detailNote.value ? notePermission(detailNote.value) !== 'read' : true))

function openDetail(note: Note) {
  detailId.value = note.id
  isDetailOpen.value = true
}

function openGroup(name: string) {
  navigateTo({ name: 'g-group', params: { group: name } })
}

function shorten(text: string, max = 140): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 1)}…` : single
}

async function handleDelete(id: number) {
  const note = notes.value.find(n => n.id === id)

  if (prefs.value.confirmDelete) {
    const confirmed = await ask({
      title: 'Eliminare questa nota?',
      description: note ? shorten(note.title) : undefined,
      confirmLabel: 'Elimina',
      tone: 'danger',
      icon: 'i-lucide-trash-2'
    })
    if (!confirmed) return
  }

  if (detailId.value === id) {
    isDetailOpen.value = false
  }
  await deleteNote(id)
}

function handleSave(payload: { id: number, title: string, body: string, group: string }) {
  updateNote(payload.id, { title: payload.title, body: payload.body, group_name: payload.group })
}

function clearFilter() {
  groupFilter.value = 'all'
  search.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <!-- Composer -->
    <NoteComposer
      v-if="showComposer"
      :groups="availableGroups"
      :default-group="composerGroup"
    />

    <!-- Filter + search (only when the panel is not already scoped to a group) -->
    <div v-if="!group" class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div class="relative sm:w-56">
        <UIcon
          name="i-lucide-folder-tree"
          class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        />
        <select
          v-model="groupFilter"
          class="w-full appearance-none rounded-xl border border-transparent bg-slate-100 py-1.5 pr-7 pl-8 text-base font-medium text-slate-700 focus:border-accent-500 focus:outline-none sm:text-xs dark:bg-slate-800/80 dark:text-slate-200"
          aria-label="Filtra le note per gruppo"
        >
          <option value="all">Tutti i gruppi</option>
          <option v-for="name in groupsWithNotes" :key="name" :value="name">{{ name }}</option>
        </select>
        <UIcon name="i-lucide-chevron-down" class="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>

      <div class="relative flex-1">
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          :value="search"
          type="search"
          placeholder="Cerca nelle note…"
          class="w-full rounded-xl border border-transparent bg-slate-100 py-1.5 pr-8 pl-8 text-base text-slate-900 transition-all placeholder-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none sm:text-xs dark:bg-slate-800/80 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-900"
          aria-label="Cerca nelle note"
          @input="search = ($event.target as HTMLInputElement).value"
        >
        <button
          v-if="search || groupFilter !== 'all'"
          type="button"
          class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Azzera i filtri delle note"
          @click="clearFilter"
        >
          <UIcon name="i-lucide-filter-x" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && scopedNotes.length === 0" class="space-y-2">
      <div v-for="i in 2" :key="i" class="surface-card flex items-center gap-3 rounded-2xl p-4">
        <div class="h-8 w-8 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div class="flex-1 space-y-2">
          <div class="h-3.5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" :style="{ width: `${50 + (i * 17) % 30}%` }" />
          <div class="h-2.5 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="rows.length === 0"
      class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-900/30"
    >
      <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-400">
        <UIcon :name="search || groupFilter !== 'all' ? 'i-lucide-filter-x' : 'i-lucide-notebook-pen'" class="h-6 w-6" />
      </div>
      <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
        {{ search || groupFilter !== 'all' ? 'Nessun risultato' : 'Nessuna nota' }}
      </h3>
      <p class="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
        <template v-if="search || groupFilter !== 'all'">
          Nessuna nota corrisponde ai filtri scelti.
        </template>
        <template v-else-if="group">
          Questo gruppo non ha ancora note. Scegli «Nota» nel campo qui sopra per crearne una.
        </template>
        <template v-else>
          Le note sono testi liberi che puoi condividere come le attività. Creane una dal campo qui sopra.
        </template>
      </p>
    </div>

    <!-- Notes -->
    <TransitionGroup v-else tag="div" name="todo-list" class="space-y-2">
      <NoteItem
        v-for="row in rows"
        :key="row.note.id"
        :note="row.note"
        :group-meta="row.meta"
        :is-pending="activeActionId === row.note.id"
        :is-shared="row.shared"
        :can-edit="row.canEdit"
        @open-detail="openDetail"
        @open-group="openGroup"
        @delete="handleDelete"
      />
    </TransitionGroup>

    <NoteDetailModal
      v-if="detailNote"
      v-model:open="isDetailOpen"
      :note="detailNote"
      :groups="availableGroups"
      :is-shared="isShared(detailNote)"
      :can-edit="detailEditable"
      :group-icon="detailMeta.icon"
      :group-color-class="detailMeta.colorClass"
      @save="handleSave"
      @delete="handleDelete"
      @open-group="openGroup"
    />
  </div>
</template>

<style scoped>
.todo-list-enter-active,
.todo-list-leave-active {
  transition: opacity 0.22s ease-out, transform 0.22s ease-out;
}

.todo-list-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.todo-list-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

.todo-list-move {
  transition: transform 0.22s ease;
}
</style>
