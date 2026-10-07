<script setup lang="ts">
import type { TodoWithGroup } from '~/types/todo'
import type { GroupNode } from '~/types/group'
import { formatDate, dueBucket, dueLabel } from '~/utils/date'
import { haptic } from '~/utils/haptics'
import type { GroupMeta } from '~/utils/groups'
import { usePreferences } from '~/composables/usePreferences'

/**
 * One activity row.
 *
 * Clicking the label opens the reading modal; the checkbox is the only thing that
 * toggles. The label is selectable and wrapped so long text can be read and copied,
 * long text gets a "Leggi tutto" inline expansion plus the modal, and every theme
 * colour comes from the accent tokens.
 */
const props = withDefaults(defineProps<{
  todo: TodoWithGroup
  groupMeta: GroupMeta
  isPending?: boolean
  isShared?: boolean
  /** False for a list shared with me in read-only mode. */
  canEdit?: boolean
  /** The group tree, for the inline editor's picker. */
  tree?: GroupNode[]
}>(), {
  canEdit: true,
  tree: () => []
})

const emit = defineEmits<{
  (e: 'toggle', todo: TodoWithGroup): void
  (e: 'updateTitle', id: number, newTitle: string): void
  (e: 'updateGroup', id: number, groupId: string | null): void
  (e: 'openDetail', todo: TodoWithGroup): void
  (e: 'openGroup', groupId: string): void
  (e: 'delete', id: number): void
}>()

const isEditing = ref(false)
const editTitle = ref('')
const editGroupId = ref<string | null>(null)
const editRef = ref<HTMLTextAreaElement | null>(null)

const { prefs } = usePreferences()

const isLong = computed(() => props.todo.title.length > 110 || props.todo.title.includes('\n'))

const bucket = computed(() =>
  props.todo.due_at ? dueBucket(props.todo.due_at, props.todo.due_all_day) : null
)

const dueText = computed(() =>
  props.todo.due_at ? dueLabel(props.todo.due_at, props.todo.due_all_day) : ''
)

const dueChipClass = computed(() => {
  if (props.todo.completed) {
    return 'bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500'
  }
  if (bucket.value === 'overdue') {
    return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900/50 font-semibold'
  }
  if (bucket.value === 'today') {
    return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/50 font-semibold'
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
})

/**
 * Only the compact density truncates the text: "Normale" and "Comoda" show the
 * whole activity in the row (the list just gets taller and keeps scrolling), while
 * compact keeps every row to two lines with an ellipsis.
 */
const isClamped = computed(() => prefs.value.density === 'compact' && isLong.value)

/** Screen readers get a short name instead of a whole paragraph. */
const shortTitle = computed(() => {
  const single = props.todo.title.replace(/\s+/g, ' ').trim()
  return single.length > 60 ? `${single.slice(0, 59)}…` : single
})

function startEditing() {
  if (props.isPending) return
  editTitle.value = props.todo.title
  editGroupId.value = props.todo.group_id ?? null
  isEditing.value = true
  nextTick(() => {
    const el = editRef.value
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
    autosize(el)
  })
}

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 260)}px`
}

function saveEdit() {
  if (!isEditing.value) return
  const trimmed = editTitle.value.trim()
  if (trimmed && trimmed !== props.todo.title) {
    emit('updateTitle', props.todo.id, trimmed)
  }
  if ((editGroupId.value ?? null) !== (props.todo.group_id ?? null)) {
    emit('updateGroup', props.todo.id, editGroupId.value)
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
  editTitle.value = props.todo.title
  editGroupId.value = props.todo.group_id ?? null
}

/** Keep drag-selection working: a click that ends a selection must not open the modal. */
function openDetail() {
  if (import.meta.client && (window.getSelection()?.toString()?.length ?? 0) > 0) return
  emit('openDetail', props.todo)
}

/**
 * Completing an activity is the tap worth feeling. `haptic()` is a no-op on iOS
 * (and anywhere haptics are off), so nothing depends on it.
 */
function toggleComplete() {
  haptic(12)
  emit('toggle', props.todo)
}
</script>

<template>
  <article
    class="todo-row group relative flex items-start rounded-2xl border transition duration-200"
    :class="[
      todo.completed
        ? 'border-slate-200/70 bg-slate-50/80 dark:border-slate-800/70 dark:bg-slate-900/40'
        : 'surface-card hover:border-accent-500/40 hover:shadow-md dark:hover:border-accent-500/30',
      isShared ? 'border-l-2 border-l-sky-400/70 dark:border-l-sky-500/50' : ''
    ]"
  >
    <!-- Completion toggle: the only thing that toggles on click -->
    <button
      type="button"
      role="checkbox"
      :aria-checked="Boolean(todo.completed)"
      :aria-label="todo.completed ? `Segna come da fare: ${shortTitle}` : `Segna come completata: ${shortTitle}`"
      class="mt-0.5 flex h-5.5 w-5.5 flex-shrink-0 items-center justify-center rounded-lg border transition duration-150 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
      :class="[
        todo.completed
          ? 'border-accent-500 bg-accent-500 text-white'
          : 'border-slate-300 bg-white hover:border-accent-500 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-accent-400'
      ]"
      :disabled="isPending || !canEdit"
      @click="toggleComplete"
    >
      <UIcon
        name="i-lucide-check"
        class="h-3.5 w-3.5 transition-transform duration-150"
        :class="todo.completed ? 'scale-100' : 'scale-0'"
      />
    </button>

    <div class="min-w-0 flex-1">
      <!-- Inline editor -->
      <form v-if="isEditing" class="w-full space-y-2" @submit.prevent="saveEdit">
        <textarea
          ref="editRef"
          v-model="editTitle"
          rows="1"
          class="todo-title w-full resize-none rounded-xl border border-accent-500 bg-white px-2.5 py-1.5 text-slate-900 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:bg-slate-800 dark:text-white"
          aria-label="Testo dell'attività"
          @input="autosize(editRef)"
          @keydown.esc.prevent="cancelEdit"
          @keydown.meta.enter.prevent="saveEdit"
          @keydown.ctrl.enter.prevent="saveEdit"
        />
        <div class="flex flex-wrap items-center gap-2">
          <GroupSelect
            v-if="tree.length"
            v-model="editGroupId"
            :tree="tree"
            aria-label="Gruppo"
            class="max-w-[14rem] text-xs"
          />
          <button
            type="submit"
            class="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-accent-700"
          >
            Salva
          </button>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
            @click="cancelEdit"
          >
            Annulla
          </button>
        </div>
      </form>

      <!-- Read view -->
      <template v-else>
        <button
          type="button"
          class="block w-full cursor-pointer text-left focus-visible:outline-none"
          :aria-label="`Apri il dettaglio di: ${shortTitle}`"
          @click="openDetail"
        >
          <span
            class="todo-title w-full whitespace-pre-line break-words select-text"
            :class="[
              // `display` must come from exactly one utility here: line-clamp-2 relies
              // on `display: -webkit-box`, which a sibling `block` would override — the
              // reason the text was not actually being truncated.
              isClamped ? 'line-clamp-2' : 'block',
              todo.completed
                ? 'text-slate-400 line-through dark:text-slate-500'
                : 'text-slate-800 hover:text-accent-700 dark:text-slate-100 dark:hover:text-accent-300'
            ]"
          >{{ todo.title }}</span>
        </button>

        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <!-- Group chip: tapping it opens that group's page -->
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
            :class="groupMeta.colorClass"
            :title="`Apri il gruppo: ${groupMeta.name}`"
            @click.stop="todo.group_id && emit('openGroup', todo.group_id)"
          >
            <UIcon :name="groupMeta.icon" class="h-3 w-3" />
            <span class="todo-meta">{{ groupMeta.name }}</span>
          </button>

          <!-- Due date chip -->
          <button
            v-if="todo.due_at"
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
            :class="dueChipClass"
            :title="`Scadenza: ${dueText}`"
            @click.stop="emit('openDetail', todo)"
          >
            <UIcon
              :name="bucket === 'overdue' && !todo.completed ? 'i-lucide-alert-circle' : 'i-lucide-calendar'"
              class="h-3 w-3 flex-shrink-0"
            />
            <span class="todo-meta">{{ dueText }}</span>
          </button>

          <span
            v-if="isShared"
            class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
            title="Attività condivisa con te da un altro utente"
          >
            <UIcon name="i-lucide-users" class="h-3 w-3" />
            <span class="todo-meta">Condivisa</span>
          </span>

          <span
            v-if="!canEdit"
            class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            title="Questa lista è condivisa in sola lettura"
          >
            <UIcon name="i-lucide-lock" class="h-3 w-3" />
            <span class="todo-meta">Sola lettura</span>
          </span>

          <span
            v-else-if="todo.created_at"
            class="todo-meta inline-flex items-center gap-1 text-slate-400 select-none dark:text-slate-500"
          >
            <UIcon name="i-lucide-clock" class="h-3 w-3" />
            <span>{{ formatDate(todo.created_at) }}</span>
          </span>

          <!-- Compact density truncates: make the rest one tap away. -->
          <button
            v-if="isClamped"
            type="button"
            class="todo-meta inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-accent-700 transition-colors hover:bg-accent-50 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:text-accent-300 dark:hover:bg-accent-950/50"
            @click="emit('openDetail', todo)"
          >
            <UIcon name="i-lucide-chevron-down" class="h-3 w-3" />
            <span>Leggi tutto · {{ todo.title.length }} caratteri</span>
          </button>
        </div>
      </template>
    </div>

    <!-- Row actions: always reachable on touch, revealed on hover with a pointer -->
    <div
      v-if="canEdit"
      class="flex flex-shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-200"
        :aria-label="`Modifica ${shortTitle}`"
        title="Modifica in linea"
        @click="startEditing"
      >
        <UIcon name="i-lucide-pencil" class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:outline-none dark:hover:bg-red-950/40 dark:hover:text-red-400"
        :aria-label="`Elimina ${shortTitle}`"
        title="Elimina"
        :disabled="isPending"
        @click="emit('delete', todo.id)"
      >
        <UIcon :name="isPending ? 'i-lucide-loader-circle' : 'i-lucide-trash-2'" class="h-4 w-4" :class="isPending ? 'animate-spin' : ''" />
      </button>
    </div>
  </article>
</template>
