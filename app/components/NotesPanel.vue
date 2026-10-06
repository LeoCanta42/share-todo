<script setup lang="ts">
import { useNotes } from '~/composables/useNotes'
import { useGroups } from '~/composables/useGroups'
import { useConfirm } from '~/composables/useConfirm'
import { usePreferences } from '~/composables/usePreferences'
import { groupMetaOf } from '~/utils/groups'
import type { NoteWithGroup } from '~/types/note'
import type { GroupNode } from '~/types/group'

/**
 * A list of notes: either for one group *and its sub-groups* (`groupId` set — the
 * group page), or for everything (the /notes page, which then offers a group filter
 * and a search).
 */
const props = withDefaults(defineProps<{
  /** Show the notes of this group and everything below it; null lists every note. */
  groupId?: string | null
  /** Show the inline composer (the /notes and group pages have their own). */
  showComposer?: boolean
}>(), {
  groupId: null,
  showComposer: false
})

const { notes, loading, activeActionId, notePermission, isShared, updateNote, deleteNote } = useNotes()
const { flat, tree, namePath } = useGroups()
const { ask } = useConfirm()
const { prefs } = usePreferences()

const groupFilter = ref<string>('all')
const search = ref('')

const isDetailOpen = ref(false)
const detailId = ref<number | null>(null)

const detailNote = computed<NoteWithGroup | null>(
  () => notes.value.find(note => note.id === detailId.value) ?? null
)

/**
 * The notes the panel is about: one group's sub-tree, or everything. `path` holds the
 * group and its ancestors, so "inside this group" is a membership test.
 */
const scopedNotes = computed(() => {
  if (!props.groupId) return notes.value
  return notes.value.filter(note => note.group?.path.includes(props.groupId!))
})

const visibleNotes = computed(() => {
  let list = scopedNotes.value

  if (!props.groupId && groupFilter.value !== 'all') {
    if (groupFilter.value === 'none') {
      list = list.filter(note => !note.group_id)
    } else {
      list = list.filter(note => note.group?.path.includes(groupFilter.value) ?? false)
    }
  }

  const query = search.value.trim().toLowerCase()
  if (query) {
    list = list.filter(note =>
      note.title.toLowerCase().includes(query) || note.body.toLowerCase().includes(query)
    )
  }

  return list
})

/** Only the groups that actually hold a note are worth offering as a filter. */
const groupsWithNotes = computed<GroupNode[]>(() => {
  const ids = new Set<string>()
  for (const note of scopedNotes.value) {
    if (note.group_id) ids.add(note.group_id)
  }
  return flat.value.filter(node => ids.has(node.group.id))
})

const hasNotes = computed(() => scopedNotes.value.length > 0)
const isFiltering = computed(() => groupFilter.value !== 'all' || search.value.trim() !== '')

function clearFilter() {
  groupFilter.value = 'all'
  search.value = ''
}

function openDetail(note: NoteWithGroup) {
  detailId.value = note.id
  isDetailOpen.value = true
}

function openGroup(groupId: string) {
  navigateTo({ name: 'g-group', params: { group: namePath(groupId) } })
}

async function handleDelete(id: number) {
  const note = notes.value.find(item => item.id === id)

  if (prefs.value.confirmDelete) {
    const confirmed = await ask({
      title: 'Eliminare questa nota?',
      description: note ? note.title : undefined,
      confirmLabel: 'Elimina',
      tone: 'danger',
      icon: 'i-lucide-trash-2'
    })
    if (!confirmed) return
  }

  if (detailId.value === id) isDetailOpen.value = false
  await deleteNote(id)
}

function handleDetailSave(payload: { id: number, title: string, body: string, groupId: string | null }) {
  const note = notes.value.find(item => item.id === payload.id)
  if (!note) return
  updateNote(payload.id, {
    title: payload.title,
    body: payload.body,
    group_id: payload.groupId
  })
}
</script>

<template>
  <div class="space-y-2.5">
    <!-- Filters: only off a group page, where they would be redundant -->
    <div v-if="!groupId && hasNotes" class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <GroupSelect
        v-model="groupFilter"
        :tree="tree"
        allow-whole-list
        whole-list-label="Tutti i gruppi"
        aria-label="Filtra le note per gruppo"
        class="sm:max-w-[16rem]"
      />

      <label class="relative flex-1">
        <UIcon name="i-lucide-search" class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          v-model="search"
          type="search"
          placeholder="Cerca nelle note…"
          class="w-full rounded-xl border border-transparent bg-slate-100 py-1.5 pr-8 pl-8 text-base text-slate-900 transition placeholder-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none sm:text-xs dark:bg-slate-800/80 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-900"
          aria-label="Cerca nelle note"
        >
      </label>
    </div>

    <!-- Loading -->
    <div v-if="loading && !hasNotes" class="space-y-2">
      <div v-for="i in 3" :key="i" class="surface-card space-y-2 rounded-2xl p-3.5">
        <div class="h-3.5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" :style="{ width: `${50 + (i * 17) % 30}%` }" />
        <div class="h-2.5 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="visibleNotes.length === 0" class="anim-rise surface-card rounded-2xl px-4 py-10 text-center">
      <UIcon name="i-lucide-notebook-pen" class="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
      <p class="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
        {{ hasNotes ? 'Nessuna nota corrisponde' : 'Ancora nessuna nota' }}
      </p>
      <p class="todo-meta mt-1 text-slate-400 dark:text-slate-500">
        {{ hasNotes
          ? 'Prova a cambiare il gruppo o la ricerca.'
          : 'Le note seguono i gruppi: chi vede il gruppo, vede le sue note.' }}
      </p>
      <UButton
        v-if="isFiltering"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-filter-x"
        class="mt-3 rounded-xl"
        @click="clearFilter"
      >
        Azzera i filtri
      </UButton>
    </div>

    <div v-else class="space-y-2">
      <NoteItem
        v-for="note in visibleNotes"
        :key="note.id"
        :note="note"
        :group-meta="groupMetaOf(note.group, note.group_name)"
        :is-pending="activeActionId === note.id"
        :is-shared="isShared(note)"
        :can-edit="notePermission(note) !== 'read'"
        @open-detail="openDetail"
        @open-group="openGroup"
        @delete="handleDelete"
      />

      <p v-if="isFiltering" class="todo-meta pt-1 text-center text-slate-400 dark:text-slate-500">
        {{ visibleNotes.length }} di {{ scopedNotes.length }} note
      </p>
    </div>

    <NoteDetailModal
      v-if="detailNote"
      v-model:open="isDetailOpen"
      :note="detailNote"
      :tree="tree"
      @save="handleDetailSave"
      @delete="handleDelete"
      @open-group="openGroup"
    />
  </div>
</template>
