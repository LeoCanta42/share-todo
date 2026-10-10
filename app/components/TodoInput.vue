<script setup lang="ts">
import { useGroups } from '~/composables/useGroups'
import { MAX_GROUP_DEPTH } from '~/utils/groupTree'
import { groupMetaOf } from '~/utils/groups'
import { buildIsoDueAt, dueLabel, toInputDate, toInputTime, REMINDER_OPTIONS, reminderLabel, formatShortDate } from '~/utils/date'
import type { GroupNode } from '~/types/group'
import type { TodoDueOptions } from '~/types/todo'

/**
 * Quick-add bar.
 *
 * A growing textarea: Enter adds, Shift+Enter starts a new line, so a long
 * multi-line activity can be written straight from the bar. The group picker opens a
 * tree (groups nest now) with a search over the whole tree, and can create a
 * sub-group under the group that is currently selected.
 * Supports setting a due date / time with quick chips (Oggi, Domani, +1 settimana).
 */
const props = defineProps<{
  loading?: boolean
  /** The group tree, as `useGroups().tree` returns it. */
  tree: GroupNode[]
  defaultGroupId?: string | null
  /** Bumped by the FAB / empty state to focus the field. */
  focusSignal?: number
  /** Text to start from — set by the share page, empty everywhere else. */
  initialTitle?: string
}>()

const emit = defineEmits<{
  (e: 'add', title: string, groupId: string | null, dueOptions?: TodoDueOptions): void
}>()

const { flat, createGroup, depthOfChild, canAddChild } = useGroups()

const inputTitle = ref((props.initialTitle ?? '').trim())
const selectedGroupId = ref<string | null>(props.defaultGroupId ?? null)
const isPickerOpen = ref(false)
const isDuePickerOpen = ref(false)
const newGroupName = ref('')
const groupFilter = ref('')
const isFocused = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)
const duePickerRef = ref<HTMLElement | null>(null)

// Due date and reminder state
const dueDate = ref('')
const dueTime = ref('18:00')
const dueAllDay = ref(true)

const reminderMode = ref<'none' | 'relative' | 'custom'>('none')
const reminderMinutes = ref<number | null>(0)
const reminderDate = ref('')
const reminderTime = ref('09:00')

const selected = computed(() => flat.value.find(node => node.group.id === selectedGroupId.value) ?? null)
const selectedMeta = computed(() => groupMetaOf(selected.value?.group, 'Generale'))

const hasDueDate = computed(() => Boolean(dueDate.value))
const hasReminder = computed(() => {
  if (reminderMode.value === 'relative') {
    return hasDueDate.value && reminderMinutes.value !== null
  }
  if (reminderMode.value === 'custom') {
    return Boolean(reminderDate.value)
  }
  return false
})
const hasSchedule = computed(() => hasDueDate.value || hasReminder.value)

const formattedDueLabel = computed(() => {
  if (!dueDate.value) return ''
  const iso = buildIsoDueAt(dueDate.value, dueTime.value, dueAllDay.value)
  return dueLabel(iso, dueAllDay.value)
})

const reminderBadgeText = computed(() => {
  if (reminderMode.value === 'custom' && reminderDate.value) {
    const d = new Date(`${reminderDate.value}T${reminderTime.value || '00:00'}:00`)
    if (!Number.isNaN(d.getTime())) {
      const now = new Date()
      const sameDay = d.toDateString() === now.toDateString()
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const isTomorrow = d.toDateString() === tomorrow.toDateString()
      const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      if (sameDay) return `Oggi ${timeStr}`
      if (isTomorrow) return `Domani ${timeStr}`
      return `${formatShortDate(d.toISOString())} ${timeStr}`
    }
  }
  if (reminderMode.value === 'relative' && reminderMinutes.value !== null) {
    return reminderLabel(reminderMinutes.value)
  }
  return ''
})

const scheduleButtonLabel = computed(() => {
  if (hasDueDate.value && hasReminder.value) {
    return `${formattedDueLabel.value} · 🔔`
  }
  if (hasDueDate.value) {
    return formattedDueLabel.value
  }
  if (hasReminder.value) {
    return `🔔 ${reminderBadgeText.value}`
  }
  return 'Scadenza'
})

/** The tree, filtered by the picker's search box (a flat, indented list). */
const visibleGroups = computed(() => {
  const query = groupFilter.value.trim().toLowerCase()
  if (!query) return flat.value
  return flat.value.filter(node =>
    node.group.name.toLowerCase().includes(query)
    // A parent matches when one of its descendants does, so the sub-group stays
    // reachable through its parent's name.
    || node.group.path.some(id => (flat.value.find(n => n.group.id === id)?.group.name ?? '').toLowerCase().includes(query))
  )
})

const canCreateUnderSelection = computed(() =>
  selectedGroupId.value ? canAddChild(selectedGroupId.value) : true
)

const createLabel = computed(() =>
  selectedGroupId.value && canCreateUnderSelection.value
    ? `Nuovo sottogruppo di "${selected.value?.group.name ?? ''}"`
    : 'Nuovo gruppo'
)

watch(() => props.defaultGroupId, (value) => {
  if (value) selectedGroupId.value = value
})

watch(() => props.focusSignal, () => focus())

function focus() {
  inputRef.value?.focus()
  autosize()
}

function autosize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  // Grow up to ~6 lines, then scroll.
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`
}

watch(inputTitle, () => nextTick(autosize))

// A composer pre-filled with shared text (the share page) must show all of it
// without waiting for the first keystroke.
onMounted(() => {
  if (inputTitle.value) nextTick(autosize)
})

function selectGroup(id: string) {
  selectedGroupId.value = id
  isPickerOpen.value = false
  groupFilter.value = ''
  nextTick(() => inputRef.value?.focus())
}

function setQuickDue(mode: 'today' | 'tomorrow' | 'next-week') {
  const target = new Date()
  if (mode === 'tomorrow') {
    target.setDate(target.getDate() + 1)
  } else if (mode === 'next-week') {
    target.setDate(target.getDate() + 7)
  }
  dueDate.value = toInputDate(target)
  if (reminderMode.value === 'none') {
    reminderMode.value = 'relative'
    reminderMinutes.value = 0
  }
}

function clearDueDate() {
  dueDate.value = ''
  dueTime.value = '18:00'
  dueAllDay.value = true
  if (reminderMode.value === 'relative') {
    reminderMode.value = 'none'
    reminderMinutes.value = null
  }
}

function setQuickReminder(preset: 'today-18' | 'tomorrow-9' | 'tomorrow-18' | 'next-week') {
  reminderMode.value = 'custom'
  const target = new Date()
  if (preset === 'today-18') {
    reminderDate.value = toInputDate(target)
    reminderTime.value = '18:00'
  } else if (preset === 'tomorrow-9') {
    target.setDate(target.getDate() + 1)
    reminderDate.value = toInputDate(target)
    reminderTime.value = '09:00'
  } else if (preset === 'tomorrow-18') {
    target.setDate(target.getDate() + 1)
    reminderDate.value = toInputDate(target)
    reminderTime.value = '18:00'
  } else if (preset === 'next-week') {
    target.setDate(target.getDate() + 7)
    reminderDate.value = toInputDate(target)
    reminderTime.value = '09:00'
  }
}

function clearReminder() {
  reminderMode.value = 'none'
  reminderMinutes.value = null
  reminderDate.value = ''
  reminderTime.value = '09:00'
}

function clearAllSchedule() {
  clearDueDate()
  clearReminder()
  isDuePickerOpen.value = false
}

async function createSubGroup() {
  const name = newGroupName.value.trim()
  if (!name) return

  const parentId = selectedGroupId.value && canCreateUnderSelection.value ? selectedGroupId.value : null
  const created = await createGroup({ name, parentId })
  if (!created) return

  newGroupName.value = ''
  groupFilter.value = ''
  selectGroup(created.id)
}

function handleSubmit() {
  const title = inputTitle.value.trim()
  if (!title || props.loading) return

  const dueAt = dueDate.value
    ? buildIsoDueAt(dueDate.value, dueTime.value, dueAllDay.value)
    : null

  let reminderAtVal: string | null = null
  let reminderMinutesVal: number | null = null

  if (reminderMode.value === 'custom' && reminderDate.value) {
    reminderAtVal = buildIsoDueAt(reminderDate.value, reminderTime.value, false)
    if (dueAt) {
      reminderMinutesVal = Math.max(0, Math.round((new Date(dueAt).getTime() - new Date(reminderAtVal).getTime()) / 60000))
    } else {
      reminderMinutesVal = 0
    }
  } else if (reminderMode.value === 'relative' && dueDate.value && reminderMinutes.value !== null) {
    reminderMinutesVal = reminderMinutes.value
    if (dueAt) {
      const targetMs = new Date(dueAt).getTime() - (reminderMinutesVal * 60000)
      reminderAtVal = new Date(targetMs).toISOString()
    }
  }

  const dueOptions: TodoDueOptions | undefined = (dueAt || reminderAtVal)
    ? {
        dueAt,
        dueAllDay: dueAllDay.value,
        reminderMinutes: reminderMinutesVal,
        reminderAt: reminderAtVal
      }
    : undefined

  emit('add', title, selectedGroupId.value, dueOptions)
  inputTitle.value = ''
  clearDueDate()
  clearReminder()
  isDuePickerOpen.value = false
  nextTick(() => {
    focus()
    autosize()
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

function onOutside(event: PointerEvent) {
  const target = event.target as Node | null
  if (pickerRef.value && isPickerOpen.value && target && !pickerRef.value.contains(target)) {
    isPickerOpen.value = false
  }
  if (duePickerRef.value && isDuePickerOpen.value && target && !duePickerRef.value.contains(target)) {
    isDuePickerOpen.value = false
  }
}

watch([isPickerOpen, isDuePickerOpen], ([openPicker, openDue]) => {
  if (!import.meta.client) return
  if (openPicker || openDue) {
    document.addEventListener('pointerdown', onOutside, true)
  } else {
    document.removeEventListener('pointerdown', onOutside, true)
    groupFilter.value = ''
  }
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    document.removeEventListener('pointerdown', onOutside, true)
  }
})
</script>

<template>
  <div class="space-y-2">
    <form
      class="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25 dark:border-slate-800 dark:bg-slate-900"
      @submit.prevent="handleSubmit"
    >
      <div class="flex items-start gap-2 px-1.5 pt-1">
        <UIcon
          name="i-lucide-plus"
          class="mt-2 h-4 w-4 flex-shrink-0 text-slate-400 dark:text-slate-500"
        />
        <textarea
          ref="inputRef"
          v-model="inputTitle"
          rows="1"
          placeholder="Cosa devi fare? Puoi anche scrivere un testo lungo…"
          class="w-full resize-none border-0 bg-transparent py-1.5 text-base leading-relaxed text-slate-900 placeholder-slate-400 focus:ring-0 focus:outline-none sm:text-sm dark:text-white dark:placeholder-slate-500"
          aria-label="Nuova attività"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @keydown="handleKeydown"
        />
      </div>

      <div class="mt-1.5 flex flex-wrap items-center gap-1.5 px-1.5 pb-0.5">
        <!-- Group picker -->
        <div ref="pickerRef" class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
            :class="selectedMeta.colorClass"
            :aria-expanded="isPickerOpen"
            aria-haspopup="listbox"
            @click="isPickerOpen = !isPickerOpen"
          >
            <UIcon :name="selectedMeta.icon" class="h-3.5 w-3.5" />
            <span class="max-w-[10rem] truncate">{{ selectedMeta.name }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="h-3 w-3 transition-transform"
              :class="isPickerOpen ? 'rotate-180' : ''"
            />
          </button>

          <div
            v-if="isPickerOpen"
            class="anim-dropdown absolute bottom-full left-0 z-50 mb-2 max-h-[70dvh] w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <label class="relative block">
              <UIcon name="i-lucide-search" class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                v-model="groupFilter"
                type="search"
                placeholder="Cerca un gruppo…"
                class="w-full rounded-lg border border-transparent bg-slate-100 py-1.5 pr-2 pl-8 text-xs text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none dark:bg-slate-800 dark:text-white"
                aria-label="Cerca gruppo"
              >
            </label>

            <div class="mt-2 max-h-56 space-y-0.5 overflow-y-auto" role="listbox" aria-label="Gruppi">
              <button
                v-for="node in visibleGroups"
                :key="node.group.id"
                type="button"
                role="option"
                :aria-selected="selectedGroupId === node.group.id"
                class="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
                :class="selectedGroupId === node.group.id
                  ? 'border-transparent bg-accent-50 text-accent-700 ring-2 ring-accent-500 dark:bg-accent-950 dark:text-accent-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'"
                :style="{ marginLeft: `${(node.depth - 1) * 0.75}rem` }"
                @click="selectGroup(node.group.id)"
              >
                <UIcon :name="groupMetaOf(node.group).icon" class="h-3.5 w-3.5 flex-shrink-0" />
                <span class="truncate">{{ node.group.name }}</span>
              </button>

              <p v-if="visibleGroups.length === 0" class="px-2 py-1.5 text-xs text-slate-400">
                Nessun gruppo trovato.
              </p>
            </div>

            <!-- Create: under the selected group when that is allowed, else at the top -->
            <div class="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p class="todo-meta mb-1 flex items-center gap-1 text-slate-400 dark:text-slate-500">
                <UIcon name="i-lucide-folder-plus" class="h-3.5 w-3.5" />
                {{ createLabel }}
              </p>
              <div class="flex gap-1.5">
                <input
                  v-model="newGroupName"
                  type="text"
                  :placeholder="selectedGroupId && canCreateUnderSelection ? `Dentro «${selected?.group.name}»` : 'Nome del gruppo'"
                  class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  aria-label="Nome del nuovo gruppo"
                  @keydown.enter.prevent="createSubGroup"
                >
                <button
                  type="button"
                  class="rounded-lg bg-accent-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
                  :disabled="!newGroupName.trim()"
                  @click="createSubGroup"
                >
                  Crea
                </button>
              </div>
              <p
                v-if="selectedGroupId && !canCreateUnderSelection"
                class="todo-meta mt-1 text-amber-600 dark:text-amber-400"
              >
                «{{ selected?.group.name }}» è già al livello più profondo ({{ MAX_GROUP_DEPTH }} livelli).
              </p>
            </div>
          </div>
        </div>

        <!-- Due date & Reminder picker -->
        <div ref="duePickerRef" class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold shadow-xs transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
            :class="hasSchedule
              ? 'border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-950 dark:text-accent-300'
              : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'"
            :aria-expanded="isDuePickerOpen"
            aria-label="Imposta scadenza o promemoria"
            @click="isDuePickerOpen = !isDuePickerOpen"
          >
            <UIcon :name="hasReminder ? 'i-lucide-bell' : 'i-lucide-calendar'" class="h-3.5 w-3.5" />
            <span class="max-w-[10rem] truncate">{{ scheduleButtonLabel }}</span>
            <button
              v-if="hasSchedule"
              type="button"
              class="ml-0.5 rounded-full p-0.5 hover:bg-accent-200/60 dark:hover:bg-accent-900"
              title="Azzera scadenza e promemoria"
              @click.stop="clearAllSchedule"
            >
              <UIcon name="i-lucide-x" class="h-3 w-3" />
            </button>
          </button>

          <div
            v-if="isDuePickerOpen"
            class="anim-dropdown absolute bottom-full left-0 z-50 mb-2 max-h-[75dvh] w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <!-- Scadenza -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <UIcon name="i-lucide-calendar" class="h-3.5 w-3.5 text-accent-500" />
                  Scadenza (opzionale)
                </span>
                <button
                  v-if="hasDueDate"
                  type="button"
                  class="text-[11px] text-red-600 hover:underline dark:text-red-400"
                  @click="clearDueDate"
                >
                  Rimuovi
                </button>
              </div>

              <!-- Quick chips for due date -->
              <div class="flex flex-wrap gap-1">
                <button
                  type="button"
                  class="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  @click="setQuickDue('today')"
                >
                  Oggi
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  @click="setQuickDue('tomorrow')"
                >
                  Domani
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  @click="setQuickDue('next-week')"
                >
                  +1 sett
                </button>
              </div>

              <div class="grid grid-cols-2 gap-2 pt-1">
                <div :class="dueAllDay ? 'col-span-2' : 'col-span-1'">
                  <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Data</label>
                  <input
                    v-model="dueDate"
                    type="date"
                    class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                </div>
                <div v-if="!dueAllDay">
                  <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Ora</label>
                  <input
                    v-model="dueTime"
                    type="time"
                    class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                </div>
              </div>

              <label class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer pt-0.5">
                <input
                  v-model="dueAllDay"
                  type="checkbox"
                  class="rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                >
                <span>Tutto il giorno</span>
              </label>
            </div>

            <!-- Promemoria Notifica -->
            <div class="mt-3.5 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <UIcon name="i-lucide-bell" class="h-3.5 w-3.5 text-accent-500" />
                  Promemoria notifica
                </span>
                <button
                  v-if="reminderMode !== 'none'"
                  type="button"
                  class="text-[11px] text-red-600 hover:underline dark:text-red-400"
                  @click="clearReminder"
                >
                  Nessuno
                </button>
              </div>

              <!-- Mode selector buttons -->
              <div class="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
                <button
                  v-if="hasDueDate"
                  type="button"
                  class="rounded-lg py-1 text-[11px] font-medium transition"
                  :class="reminderMode === 'relative'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
                  @click="reminderMode = 'relative'; if (reminderMinutes === null) reminderMinutes = 0"
                >
                  Prima della scadenza
                </button>
                <button
                  type="button"
                  class="rounded-lg py-1 text-[11px] font-medium transition"
                  :class="[
                    !hasDueDate ? 'col-span-2' : '',
                    reminderMode === 'custom'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  ]"
                  @click="reminderMode = 'custom'; if (!reminderDate) setQuickReminder('today-18')"
                >
                  Data e ora precisa
                </button>
              </div>

              <!-- Relative options (when due date exists) -->
              <div v-if="reminderMode === 'relative' && hasDueDate" class="pt-1">
                <select
                  v-model="reminderMinutes"
                  class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option
                    v-for="opt in REMINDER_OPTIONS"
                    :key="String(opt.value)"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>

              <!-- Custom date/time options -->
              <div v-if="reminderMode === 'custom'" class="space-y-2 pt-1">
                <!-- Quick presets -->
                <div class="flex flex-wrap gap-1">
                  <button
                    type="button"
                    class="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    @click="setQuickReminder('today-18')"
                  >
                    Oggi 18:00
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    @click="setQuickReminder('tomorrow-9')"
                  >
                    Domani 09:00
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    @click="setQuickReminder('tomorrow-18')"
                  >
                    Domani 18:00
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    @click="setQuickReminder('next-week')"
                  >
                    +1 sett
                  </button>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Data notifica</label>
                    <input
                      v-model="reminderDate"
                      type="date"
                      class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                  </div>
                  <div>
                    <label class="todo-meta mb-0.5 block text-slate-400 dark:text-slate-500">Ora notifica</label>
                    <input
                      v-model="reminderTime"
                      type="time"
                      class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <button
                v-if="hasSchedule"
                type="button"
                class="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                @click="clearAllSchedule"
              >
                Azzera tutto
              </button>
              <button
                type="button"
                class="ml-auto rounded-lg bg-accent-600 px-3 py-1 text-xs font-semibold text-white hover:bg-accent-700"
                @click="isDuePickerOpen = false"
              >
                Fine
              </button>
            </div>
          </div>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <span v-if="isFocused" class="todo-meta hidden text-slate-400 sm:inline dark:text-slate-500">
            Invio per aggiungere · Shift+Invio per andare a capo
          </span>
          <button
            type="submit"
            class="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-accent-700 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!inputTitle.trim() || loading"
          >
            <UIcon
              :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-plus'"
              class="h-3.5 w-3.5"
              :class="loading ? 'animate-spin' : ''"
            />
            <span>Aggiungi</span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
