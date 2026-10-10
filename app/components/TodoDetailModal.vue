<script setup lang="ts">
import type { TodoWithGroup } from '~/types/todo'
import type { GroupNode } from '~/types/group'
import { formatFullDate, buildIsoDueAt, dueBucket, dueLabel, toInputDate, toInputTime, REMINDER_OPTIONS, reminderLabel, formatReminderDisplay } from '~/utils/date'
import { haptic } from '~/utils/haptics'
import { groupMetaOf } from '~/utils/groups'
import { usePreferences, TEXT_SIZES } from '~/composables/usePreferences'
import { useWebShare } from '~/composables/useWebShare'
import { useShares } from '~/composables/useShares'
import { useCurrentUser } from '~/composables/useCurrentUser'

/**
 * Reading and editing view for a single activity.
 *
 * Long activities used to be unreadable: the label was `select-none`, clamped to
 * one line by the row, and double-click opened a one-line input. This dialog shows
 * the full text (newlines preserved, selectable, scrollable), offers a larger reading
 * size, and keeps editing, moving between groups, setting due dates and deleting in one place.
 */
const props = defineProps<{
  open: boolean
  todo: TodoWithGroup | null
  /** The group tree, for the group picker. */
  tree: GroupNode[]
  initialEdit?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'toggle', todo: TodoWithGroup): void
  (e: 'save', payload: {
    id: number
    title: string
    groupId: string | null
    dueAt: string | null
    dueAllDay: boolean
    reminderMinutes?: number | null
    reminderAt?: string | null
  }): void
  (e: 'delete', id: number): void
  (e: 'open-group', groupId: string): void
}>()

const { prefs, update } = usePreferences()
const { userId } = useCurrentUser()
const { permissionFor } = useShares()
const { canShare, share } = useWebShare()

const isEditing = ref(false)
const draftTitle = ref('')
const draftGroupId = ref<string | null>(null)
const draftDueDate = ref('')
const draftDueTime = ref('18:00')
const draftDueAllDay = ref(true)

// Reminder state: supports relative (before expire) or custom specific date/time
const reminderMode = ref<'none' | 'relative' | 'custom'>('none')
const draftReminderMinutes = ref<number | null>(null)
const draftReminderDate = ref('')
const draftReminderTime = ref('09:00')

const copied = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const title = computed(() => props.todo?.title ?? '')
const meta = computed(() => groupMetaOf(props.todo?.group, props.todo?.group_name))
const groupName = computed(() => meta.value.name)
const isLong = computed(() => title.value.length > 90 || title.value.includes('\n'))
const charCount = computed(() => draftTitle.value.trim().length)
const canEdit = computed(() => (props.todo ? permissionFor(props.todo) !== 'read' : true))
const isShared = computed(() => Boolean(props.todo?.user_id && props.todo.user_id !== userId.value))

const dueStatus = computed(() => {
  if (!props.todo?.due_at) return null
  const bucket = dueBucket(props.todo.due_at, props.todo.due_all_day)
  const label = dueLabel(props.todo.due_at, props.todo.due_all_day)
  return { bucket, label }
})

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
  if (!props.todo || !canEdit.value) return
  draftTitle.value = props.todo.title
  draftGroupId.value = props.todo.group_id ?? null

  if (props.todo.due_at) {
    const d = new Date(props.todo.due_at)
    draftDueDate.value = toInputDate(d)
    draftDueTime.value = toInputTime(d)
    draftDueAllDay.value = Boolean(props.todo.due_all_day)
  } else {
    draftDueDate.value = ''
    draftDueTime.value = '18:00'
    draftDueAllDay.value = true
  }

  // Load reminder state
  if (props.todo.reminder_at) {
    reminderMode.value = 'custom'
    const rDate = new Date(props.todo.reminder_at)
    draftReminderDate.value = toInputDate(rDate)
    draftReminderTime.value = toInputTime(rDate)
    draftReminderMinutes.value = props.todo.reminder_minutes ?? null
  } else if (props.todo.reminder_minutes !== null && props.todo.due_at) {
    reminderMode.value = 'relative'
    draftReminderMinutes.value = props.todo.reminder_minutes
    draftReminderDate.value = ''
    draftReminderTime.value = '09:00'
  } else {
    reminderMode.value = 'none'
    draftReminderMinutes.value = null
    draftReminderDate.value = ''
    draftReminderTime.value = '09:00'
  }

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

function setQuickDraftDue(mode: 'today' | 'tomorrow' | 'next-week') {
  const target = new Date()
  if (mode === 'tomorrow') target.setDate(target.getDate() + 1)
  else if (mode === 'next-week') target.setDate(target.getDate() + 7)
  draftDueDate.value = toInputDate(target)
  if (reminderMode.value === 'none') {
    reminderMode.value = 'relative'
    draftReminderMinutes.value = 0
  }
}

function clearDraftDue() {
  draftDueDate.value = ''
  draftDueTime.value = '18:00'
  draftDueAllDay.value = true
  if (reminderMode.value === 'relative') {
    reminderMode.value = 'none'
    draftReminderMinutes.value = null
  }
}

function setQuickReminder(preset: 'today-18' | 'tomorrow-9' | 'tomorrow-18' | 'next-week') {
  reminderMode.value = 'custom'
  const target = new Date()
  if (preset === 'today-18') {
    draftReminderDate.value = toInputDate(target)
    draftReminderTime.value = '18:00'
  } else if (preset === 'tomorrow-9') {
    target.setDate(target.getDate() + 1)
    draftReminderDate.value = toInputDate(target)
    draftReminderTime.value = '09:00'
  } else if (preset === 'tomorrow-18') {
    target.setDate(target.getDate() + 1)
    draftReminderDate.value = toInputDate(target)
    draftReminderTime.value = '18:00'
  } else if (preset === 'next-week') {
    target.setDate(target.getDate() + 7)
    draftReminderDate.value = toInputDate(target)
    draftReminderTime.value = '09:00'
  }
}

function clearReminder() {
  reminderMode.value = 'none'
  draftReminderMinutes.value = null
  draftReminderDate.value = ''
  draftReminderTime.value = '09:00'
}

function selectRelativeReminder() {
  reminderMode.value = 'relative'
  if (draftReminderMinutes.value === null) {
    draftReminderMinutes.value = 0
  }
}

function selectCustomReminder() {
  reminderMode.value = 'custom'
  if (!draftReminderDate.value) {
    setQuickReminder('tomorrow-9')
  }
}

function save() {
  if (!props.todo) return
  const trimmed = draftTitle.value.trim()
  if (!trimmed) return

  const dueAt = draftDueDate.value
    ? buildIsoDueAt(draftDueDate.value, draftDueTime.value, draftDueAllDay.value)
    : null

  let reminderAt: string | null = null
  let reminderMinutes: number | null = null

  if (reminderMode.value === 'custom' && draftReminderDate.value) {
    reminderAt = buildIsoDueAt(draftReminderDate.value, draftReminderTime.value, false)
    if (dueAt) {
      reminderMinutes = Math.max(0, Math.round((new Date(dueAt).getTime() - new Date(reminderAt).getTime()) / 60000))
    } else {
      reminderMinutes = 0
    }
  } else if (reminderMode.value === 'relative' && draftDueDate.value && draftReminderMinutes.value !== null) {
    reminderMinutes = draftReminderMinutes.value
    if (dueAt) {
      const targetMs = new Date(dueAt).getTime() - (reminderMinutes * 60000)
      reminderAt = new Date(targetMs).toISOString()
    }
  }

  emit('save', {
    id: props.todo.id,
    title: trimmed,
    groupId: draftGroupId.value,
    dueAt,
    dueAllDay: draftDueAllDay.value,
    reminderMinutes,
    reminderAt
  })
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

watch([() => props.open, () => props.initialEdit, () => props.todo?.id], ([open, initialEdit]) => {
  if (open) {
    if (initialEdit) {
      nextTick(() => startEditing())
    }
  } else {
    isEditing.value = false
    copied.value = false
  }
}, { immediate: true })

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
          :class="meta.colorClass"
          :title="`Vedi il gruppo ${groupName}`"
          @click="todo.group_id && emit('open-group', todo.group_id); emit('update:open', false)"
        >
          <UIcon :name="meta.icon" class="h-3.5 w-3.5" />
          <span>{{ groupName }}</span>
        </button>

        <span
          v-if="isShared"
          class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
        >
          <UIcon name="i-lucide-users" class="h-3.5 w-3.5" />
          <span>Condivisa con te</span>
        </span>

        <span
          v-if="!canEdit"
          class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          <UIcon name="i-lucide-lock" class="h-3.5 w-3.5" />
          <span>Sola lettura</span>
        </span>
      </div>

      <!-- Reading -->
      <div v-if="!isEditing" class="space-y-3">
        <p
          class="reading-text whitespace-pre-wrap break-words text-slate-800 select-text dark:text-slate-100"
          :class="!isLong ? 'reading-text-lg' : ''"
        >
          {{ todo.title }}
        </p>
      </div>

      <!-- Editing -->
      <div v-else class="space-y-3">
        <textarea
          ref="textareaRef"
          v-model="draftTitle"
          rows="3"
          class="reading-text w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          aria-label="Testo dell'attività"
          :disabled="!canEdit"
        />
        <div class="space-y-1.5">
          <label class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Gruppo
          </label>
          <GroupSelect
            v-model="draftGroupId"
            :tree="tree"
            :disabled="!canEdit"
            aria-label="Gruppo dell'attività"
          />
        </div>

        <!-- Due date editor -->
        <div class="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700/60 dark:bg-slate-800/30">
          <div class="flex items-center justify-between">
            <label class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
              Scadenza
            </label>
            <div class="flex gap-1">
              <button
                type="button"
                class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                @click="setQuickDraftDue('today')"
              >
                Oggi
              </button>
              <button
                type="button"
                class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                @click="setQuickDraftDue('tomorrow')"
              >
                Domani
              </button>
              <button
                type="button"
                class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                @click="setQuickDraftDue('next-week')"
              >
                +1 sett
              </button>
              <button
                v-if="draftDueDate"
                type="button"
                class="rounded-md px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                title="Rimuovi scadenza"
                @click="clearDraftDue"
              >
                Rimuovi
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
            <div>
              <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Data</label>
              <input
                v-model="draftDueDate"
                type="date"
                class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
            </div>

            <div v-if="draftDueDate" class="space-y-1">
              <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Orario</label>
              <div class="flex items-center gap-2">
                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    v-model="draftDueAllDay"
                    type="checkbox"
                    class="rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                  >
                  <span>Tutto il giorno</span>
                </label>
                <input
                  v-if="!draftDueAllDay"
                  v-model="draftDueTime"
                  type="time"
                  class="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Promemoria editor: impostabile con o senza scadenza -->
        <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700/60 dark:bg-slate-800/30">
          <div class="flex items-center justify-between">
            <label class="todo-meta flex items-center gap-1.5 font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
              <UIcon name="i-lucide-bell" class="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" />
              <span>Promemoria notifica</span>
            </label>

            <button
              v-if="reminderMode !== 'none'"
              type="button"
              class="rounded-md px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              title="Rimuovi promemoria"
              @click="clearReminder"
            >
              Rimuovi
            </button>
          </div>

          <!-- Selector pills -->
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              :class="reminderMode === 'none'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'"
              @click="clearReminder"
            >
              Nessuno
            </button>

            <button
              v-if="draftDueDate"
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              :class="reminderMode === 'relative'
                ? 'bg-accent-600 text-white font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'"
              @click="selectRelativeReminder"
            >
              Prima della scadenza
            </button>

            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              :class="reminderMode === 'custom'
                ? 'bg-accent-600 text-white font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'"
              @click="selectCustomReminder"
            >
              Data e ora specifica
            </button>
          </div>

          <!-- Relative dropdown -->
          <div v-if="reminderMode === 'relative' && draftDueDate" class="pt-1">
            <select
              v-model="draftReminderMinutes"
              class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option
                v-for="opt in REMINDER_OPTIONS.filter(o => o.value !== null)"
                :key="String(opt.value)"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- Custom specific date and time -->
          <div v-if="reminderMode === 'custom'" class="space-y-2 pt-1">
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                @click="setQuickReminder('today-18')"
              >
                Oggi 18:00
              </button>
              <button
                type="button"
                class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                @click="setQuickReminder('tomorrow-9')"
              >
                Domani 09:00
              </button>
              <button
                type="button"
                class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                @click="setQuickReminder('tomorrow-18')"
              >
                Domani 18:00
              </button>
              <button
                type="button"
                class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                @click="setQuickReminder('next-week')"
              >
                +1 sett
              </button>
            </div>

            <div class="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              <div>
                <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Data promemoria</label>
                <input
                  v-model="draftReminderDate"
                  type="date"
                  class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
              </div>
              <div>
                <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Ora promemoria</label>
                <input
                  v-model="draftReminderTime"
                  type="time"
                  class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
              </div>
            </div>
          </div>
        </div>

        <p class="todo-meta text-slate-400 dark:text-slate-500">
          {{ charCount }} caratteri · Premi ⌘/Ctrl + Invio per salvare
        </p>
      </div>

      <dl class="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Creata</dt>
          <dd class="mt-0.5 text-slate-700 dark:text-slate-200">{{ formatFullDate(todo.created_at) || '—' }}</dd>
        </div>
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Stato</dt>
          <dd class="mt-0.5 text-slate-700 dark:text-slate-200">{{ todo.completed ? 'Completata' : 'Da completare' }}</dd>
        </div>
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Scadenza</dt>
          <dd class="mt-0.5 flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
            <template v-if="todo.due_at">
              <span
                class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                :class="dueStatus?.bucket === 'overdue' && !todo.completed
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : dueStatus?.bucket === 'today' && !todo.completed
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'"
              >
                <UIcon
                  :name="dueStatus?.bucket === 'overdue' && !todo.completed ? 'i-lucide-alert-circle' : 'i-lucide-calendar'"
                  class="h-3 w-3"
                />
                {{ dueStatus?.label }}
              </span>
            </template>
            <span v-else class="text-slate-400 dark:text-slate-500">Nessuna</span>
          </dd>
        </div>
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Promemoria</dt>
          <dd class="mt-0.5 flex items-center gap-1 text-slate-700 dark:text-slate-200">
            <UIcon
              v-if="todo.reminder_at || todo.reminder_minutes !== null"
              name="i-lucide-bell"
              class="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
            />
            <span>{{ formatReminderDisplay(todo) }}</span>
          </dd>
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
