<script setup lang="ts">
import type { Note } from '~/types/note'
import type { GroupMeta } from '~/utils/groups'
import { formatDate } from '~/utils/date'

/**
 * One note card. Mirrors `TodoItem`: clicking the title opens the reading dialog,
 * the group chip navigates to that group's page, and the actions are only offered
 * when the note is not shared with the user in read-only mode.
 */
const props = withDefaults(defineProps<{
  note: Note
  groupMeta: GroupMeta
  isPending?: boolean
  isShared?: boolean
  canEdit?: boolean
}>(), {
  canEdit: true
})

const emit = defineEmits<{
  (e: 'openDetail', note: Note): void
  (e: 'openGroup', group: string): void
  (e: 'delete', id: number): void
}>()

/** One-line preview: the body's line breaks are noise in a card. */
const preview = computed(() => props.note.body.replace(/\s+/g, ' ').trim())

const isEmptyBody = computed(() => preview.value.length === 0)

const shortTitle = computed(() => {
  const single = props.note.title.replace(/\s+/g, ' ').trim()
  return single.length > 60 ? `${single.slice(0, 59)}…` : single
})

/** Keep drag-selection working: a click that ends a selection must not open the modal. */
function openDetail() {
  if (import.meta.client && (window.getSelection()?.toString()?.length ?? 0) > 0) return
  emit('openDetail', props.note)
}
</script>

<template>
  <article class="todo-row group relative flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 transition hover:border-accent-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500/30">
    <span
      class="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
      :class="groupMeta.colorClass"
    >
      <UIcon name="i-lucide-notebook-pen" class="h-4 w-4" />
    </span>

    <div class="min-w-0 flex-1">
      <button
        type="button"
        class="block w-full cursor-pointer text-left focus-visible:outline-none"
        :aria-label="`Apri la nota: ${shortTitle}`"
        @click="openDetail"
      >
        <span class="todo-title block w-full font-semibold break-words text-slate-800 select-text hover:text-accent-700 dark:text-slate-100 dark:hover:text-accent-300">
          {{ note.title }}
        </span>

        <span
          v-if="!isEmptyBody"
          class="mt-1 block line-clamp-2 text-xs whitespace-pre-line text-slate-500 select-text dark:text-slate-400"
        >{{ preview }}</span>
        <span v-else class="mt-1 block text-xs text-slate-400 italic dark:text-slate-500">
          Nota vuota
        </span>
      </button>

      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
          :class="groupMeta.colorClass"
          :title="`Apri il gruppo ${groupMeta.name}`"
          @click="emit('openGroup', groupMeta.name)"
        >
          <UIcon :name="groupMeta.icon" class="h-3 w-3" />
          <span class="todo-meta">{{ groupMeta.name }}</span>
        </button>

        <span
          v-if="isShared"
          class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
          title="Nota condivisa con te da un altro utente"
        >
          <UIcon name="i-lucide-users" class="h-3 w-3" />
          <span class="todo-meta">Condivisa</span>
        </span>

        <span
          v-if="!canEdit"
          class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          title="Questa nota è condivisa in sola lettura"
        >
          <UIcon name="i-lucide-lock" class="h-3 w-3" />
          <span class="todo-meta">Sola lettura</span>
        </span>

        <span
          v-if="note.updated_at"
          class="todo-meta inline-flex items-center gap-1 text-slate-400 select-none dark:text-slate-500"
        >
          <UIcon name="i-lucide-clock" class="h-3 w-3" />
          <span>{{ formatDate(note.updated_at) }}</span>
        </span>
      </div>
    </div>

    <div
      v-if="canEdit"
      class="flex flex-shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-200"
        :aria-label="`Apri ${shortTitle}`"
        title="Apri e modifica"
        @click="emit('openDetail', note)"
      >
        <UIcon name="i-lucide-pencil" class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:outline-none dark:hover:bg-red-950/40 dark:hover:text-red-400"
        :aria-label="`Elimina ${shortTitle}`"
        title="Elimina"
        :disabled="isPending"
        @click="emit('delete', note.id)"
      >
        <UIcon :name="isPending ? 'i-lucide-loader-circle' : 'i-lucide-trash-2'" class="h-4 w-4" :class="isPending ? 'animate-spin' : ''" />
      </button>
    </div>
  </article>
</template>
