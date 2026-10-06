<script setup lang="ts">
import type { Todo } from '~/types/todo'
import { formatFullDate } from '~/utils/date'
import { haptic } from '~/utils/haptics'
import { usePreferences, TEXT_SIZES } from '~/composables/usePreferences'
import { useWebShare } from '~/composables/useWebShare'

/**
 * Reading view for a single activity.
 *
 * Long activities used to be unreadable: the label was `select-none`, clamped to
 * one line by the row, and double-click opened a one-line input. This dialog
 * shows the full text (newlines preserved, selectable, scrollable), offers a
 * larger reading size, and keeps editing, retitling and deleting in one place.
 */
const props = defineProps<{
  open: boolean
  todo: Todo | null
  groups: string[]
  isShared?: boolean
  groupIcon?: string
  groupColorClass?: string
  canEdit?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'toggle', todo: Todo): void
  (e: 'save', payload: { id: number, title: string, group: string }): void
  (e: 'delete', id: number): void
  (e: 'open-group', name: string): void
}>()

const { prefs, update } = usePreferences()

const isEditing = ref(false)
const draftTitle = ref('')
const draftGroup = ref('Generale')
const copied = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const title = computed(() => props.todo?.title ?? '')
const groupName = computed(() => (props.todo?.group_name || 'Generale').trim() || 'Generale')
const isLong = computed(() => title.value.length > 90 || title.value.includes('\n'))
const charCount = computed(() => draftTitle.value.trim().length)
const sizeOptions = TEXT_SIZES.map(size => ({
  id: size.id,
  // The three buttons are the same "A", differentiated by their font size below.
  label: 'A',
  hint: size.hint
}))

function autosize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 420)}px`
}

function startEditing() {
  if (!props.todo || !props.canEdit) return
  draftTitle.value = props.todo.title
  draftGroup.value = groupName.value
  isEditing.value = true
  nextTick(() => {
    autosize()
    textareaRef.value?.focus()
    const end = textareaRef.value?.value.length ?? 0
    textareaRef.value?.setSelectionRange(end, end)
  })
}

function cancelEditing() {
  isEditing.value = false
}

function save() {
  if (!props.todo) return
  const trimmed = draftTitle.value.trim()
  if (!trimmed) return
  emit('save', { id: props.todo.id, title: trimmed, group: draftGroup.value })
  isEditing.value = false
}

async function copyText() {
  if (!props.todo || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(props.todo.title)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch (error) {
    console.error('Clipboard unavailable:', error)
  }
}

const { canShare, share } = useWebShare()

/** Hand the activity to another app — the phone's share sheet, or the clipboard. */
async function shareTodo() {
  if (!props.todo) return
  await share({ text: props.todo.title })
}

/** Completing from the dialog should feel the same as completing from the row. */
function toggleComplete() {
  if (!props.todo) return
  haptic(12)
  emit('toggle', props.todo)
}

watch(() => props.open, (open) => {
  if (!open) {
    isEditing.value = false
    copied.value = false
  }
})

// Keep the textarea sized while the user types and while the dialog opens.
watch([() => draftTitle.value, () => isEditing.value], () => {
  if (isEditing.value) nextTick(autosize)
})
</script>

<template>
  <AppModal
    :open="open"
    size="lg"
    full-height
    icon="i-lucide-file-text"
    :title="isEditing ? 'Modifica attività' : 'Dettaglio attività'"
    :subtitle="todo ? formatFullDate(todo.created_at) : undefined"
    @update:open="(value) => emit('update:open', value)"
  >
    <template #header-actions>
      <div class="ml-auto flex items-center gap-1.5">
        <!-- Reading size: the point of this dialog is being able to actually read -->
        <div class="hidden items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 sm:flex dark:bg-slate-800">
          <button
            v-for="size in sizeOptions"
            :key="size.id"
            type="button"
            class="flex h-7 items-center justify-center rounded-md px-2 font-semibold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            :class="[size.id === 'small' ? 'text-[11px]' : size.id === 'normal' ? 'text-xs' : 'text-sm', prefs.textSize === size.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : '']"
            :aria-label="`Testo ${size.label}`"
            :aria-pressed="prefs.textSize === size.id"
            :title="size.hint"
            @click="update('textSize', size.id)"
          >
            {{ size.label }}
          </button>
        </div>
      </div>
    </template>

    <div v-if="todo" class="space-y-4">
      <!-- Status + group line -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
          :class="groupColorClass"
          :title="`Vedi solo il gruppo ${groupName}`"
          @click="emit('open-group', groupName); emit('update:open', false)"
        >
          <UIcon :name="groupIcon || 'i-lucide-folder'" class="h-3.5 w-3.5" />
          <span>{{ groupName }}</span>
        </button>

        <span
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="todo.completed
            ? 'bg-accent-100 text-accent-700 dark:bg-accent-950/70 dark:text-accent-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'"
        >
          <UIcon :name="todo.completed ? 'i-lucide-circle-check' : 'i-lucide-clock'" class="h-3.5 w-3.5" />
          <span>{{ todo.completed ? 'Completata' : 'Da fare' }}</span>
        </span>

        <span
          v-if="isShared"
          class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
        >
          <UIcon name="i-lucide-users" class="h-3.5 w-3.5" />
          <span>Condivisa con te</span>
        </span>

        <span v-if="isLong && !isEditing" class="todo-meta text-slate-400 dark:text-slate-500">
          {{ title.length }} caratteri
        </span>
      </div>

      <!-- Reader / editor -->
      <div
        class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40"
      >
        <textarea
          v-if="isEditing"
          ref="textareaRef"
          v-model="draftTitle"
          rows="3"
          class="reading-text w-full resize-none rounded-xl border border-accent-500 bg-white px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:bg-slate-900 dark:text-white"
          aria-label="Testo dell'attività"
          @keydown.esc.prevent="cancelEditing"
          @keydown.meta.enter.prevent="save"
          @keydown.ctrl.enter.prevent="save"
        />
        <p v-else class="reading-text reading-text-lg whitespace-pre-wrap break-words text-slate-800 select-text dark:text-slate-100">
          {{ title }}
        </p>
      </div>

      <!-- Edit extras: group + counter -->
      <div v-if="isEditing" class="space-y-2">
        <label class="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
          Gruppo
        </label>
        <select
          v-model="draftGroup"
          class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
        </select>
        <p class="todo-meta text-slate-400 dark:text-slate-500">
          {{ charCount }} caratteri · Premi ⌘/Ctrl + Invio per salvare
        </p>
      </div>

      <dl class="grid grid-cols-2 gap-3 text-xs">
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Creata</dt>
          <dd class="mt-0.5 text-slate-700 dark:text-slate-200">{{ formatFullDate(todo.created_at) || '—' }}</dd>
        </div>
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Stato</dt>
          <dd class="mt-0.5 text-slate-700 dark:text-slate-200">{{ todo.completed ? 'Completata' : 'Da completare' }}</dd>
        </div>
      </dl>
    </div>

    <p v-else class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
      Nessuna attività selezionata.
    </p>

    <template #footer>
      <template v-if="todo">
        <UButton
          v-if="canEdit && !isEditing"
          color="primary"
          size="md"
          icon="i-lucide-check"
          class="rounded-xl font-semibold"
          @click="toggleComplete"
        >
          {{ todo.completed ? 'Segna da fare' : 'Segna completata' }}
        </UButton>

        <div class="ml-auto flex items-center gap-2">
          <template v-if="isEditing">
            <UButton
              color="neutral"
              variant="ghost"
              size="md"
              class="rounded-xl"
              @click="cancelEditing"
            >
              Annulla
            </UButton>
            <UButton
              color="primary"
              size="md"
              icon="i-lucide-save"
              class="rounded-xl font-semibold"
              :disabled="!draftTitle.trim()"
              @click="save"
            >
              Salva
            </UButton>
          </template>
          <template v-else>
            <UButton
              v-if="canEdit"
              color="neutral"
              variant="soft"
              size="md"
              icon="i-lucide-pencil"
              class="rounded-xl"
              @click="startEditing"
            >
              Modifica
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              size="md"
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              class="rounded-xl"
              :aria-label="'Copia il testo'"
              @click="copyText"
            />
            <UButton
              v-if="canShare"
              color="neutral"
              variant="soft"
              size="md"
              icon="i-lucide-share-2"
              class="rounded-xl"
              :aria-label="'Condividi il testo'"
              @click="shareTodo"
            />
            <UButton
              v-if="canEdit"
              color="error"
              variant="soft"
              size="md"
              icon="i-lucide-trash-2"
              class="rounded-xl"
              :aria-label="'Elimina attività'"
              @click="emit('delete', todo.id)"
            />
          </template>
        </div>
      </template>
    </template>
  </AppModal>
</template>
