<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'

/**
 * Quick-add bar.
 *
 * Now a growing textarea: Enter adds, Shift+Enter starts a new line, so a long
 * multi-line activity can be written straight from the bar. The group picker
 * closes on outside click / Escape (it used to stay open) and keeps a filter for
 * people with many groups.
 */
const props = defineProps<{
  loading?: boolean
  availableGroups: string[]
  defaultGroup?: string
  /** Bumped by the FAB / empty state to focus the field. */
  focusSignal?: number
}>()

const emit = defineEmits<{
  (e: 'add', title: string, group: string): void
}>()

const { groupMeta, addGroup } = useTodos()

const inputTitle = ref('')
const selectedGroup = ref(props.defaultGroup || 'Generale')
const isPickerOpen = ref(false)
const customGroupInput = ref('')
const groupFilter = ref('')
const isFocused = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)

const activeGroupMeta = computed(() => groupMeta(selectedGroup.value))

const filteredGroups = computed(() => {
  const query = groupFilter.value.trim().toLowerCase()
  if (!query) return props.availableGroups
  return props.availableGroups.filter(g => g.toLowerCase().includes(query))
})

const canCreateGroup = computed(() => {
  const query = groupFilter.value.trim()
  if (!query) return false
  return !props.availableGroups.some(g => g.toLowerCase() === query.toLowerCase())
})

watch(() => props.defaultGroup, (newVal) => {
  if (newVal && newVal !== 'all') {
    selectedGroup.value = newVal
  }
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

function selectGroup(name: string) {
  selectedGroup.value = name
  isPickerOpen.value = false
  groupFilter.value = ''
  focus()
}

function createGroup() {
  const name = groupFilter.value.trim()
  if (!name) return
  const created = addGroup(name)
  if (created) {
    selectGroup(created)
  }
}

function handleSubmit() {
  const trimmed = inputTitle.value.trim()
  if (!trimmed || props.loading) return

  emit('add', trimmed, selectedGroup.value)
  inputTitle.value = ''
  nextTick(autosize)
}

function onOutside(event: PointerEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    isPickerOpen.value = false
  }
}

watch(isPickerOpen, (open) => {
  if (!import.meta.client) return
  if (open) {
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
      class="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition-all focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25 dark:border-slate-800 dark:bg-slate-900"
      @submit.prevent="handleSubmit"
    >
      <div class="flex items-start gap-2 px-1.5 pt-1">
        <div class="pointer-events-none mt-1.5 flex-shrink-0 text-slate-400 dark:text-slate-500">
          <UIcon name="i-lucide-circle-plus" class="h-5 w-5" />
        </div>

        <textarea
          ref="inputRef"
          v-model="inputTitle"
          rows="1"
          placeholder="Cosa devi fare? Puoi anche scrivere un testo lungo…"
          class="w-full resize-none border-0 bg-transparent py-1.5 text-base leading-relaxed text-slate-900 placeholder-slate-400 focus:ring-0 focus:outline-none sm:text-sm dark:text-white dark:placeholder-slate-500"
          :disabled="loading"
          aria-label="Nuova attività"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @keydown.enter.exact.prevent="handleSubmit"
          @keydown.esc="inputTitle = ''"
        />
      </div>

      <div class="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-100 px-1.5 pt-2 dark:border-slate-800/70">
        <!-- Group picker -->
        <div ref="pickerRef" class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold shadow-xs transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
            :class="activeGroupMeta.colorClass"
            :aria-expanded="isPickerOpen"
            aria-haspopup="listbox"
            @click="isPickerOpen = !isPickerOpen"
          >
            <UIcon :name="activeGroupMeta.icon" class="h-3.5 w-3.5" />
            <span class="max-w-[9rem] truncate">{{ selectedGroup }}</span>
            <UIcon name="i-lucide-chevron-down" class="h-3 w-3 opacity-60" />
          </button>

          <div
            v-if="isPickerOpen"
            class="anim-dropdown absolute bottom-full left-0 z-50 mb-2 max-h-[70dvh] w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="relative mb-2">
              <UIcon name="i-lucide-search" class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                v-model="groupFilter"
                type="text"
                placeholder="Cerca o crea un gruppo…"
                class="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-2 pl-8 text-base text-slate-900 focus:border-accent-500 focus:outline-none sm:text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                aria-label="Cerca gruppo"
              >
            </div>

            <div class="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto p-0.5">
              <button
                v-for="group in filteredGroups"
                :key="group"
                type="button"
                role="option"
                :aria-selected="selectedGroup === group"
                class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
                :class="selectedGroup === group
                  ? 'border-transparent bg-accent-50 text-accent-700 ring-2 ring-accent-500 dark:bg-accent-950 dark:text-accent-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'"
                @click="selectGroup(group)"
              >
                <UIcon :name="groupMeta(group).icon" class="h-3 w-3" />
                <span>{{ group }}</span>
              </button>

              <p v-if="filteredGroups.length === 0" class="px-1 py-2 text-xs text-slate-400">
                Nessun gruppo trovato.
              </p>
            </div>

            <div class="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <button
                v-if="canCreateGroup"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-accent-700 transition-colors hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/50"
                @click="createGroup"
              >
                <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
                <span>Crea il gruppo “{{ groupFilter.trim() }}”</span>
              </button>
              <p v-else class="px-1 text-[11px] text-slate-400 dark:text-slate-500">
                I nuovi gruppi restano salvati anche quando sono vuoti.
              </p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span
            v-if="isFocused && inputTitle.trim()"
            class="todo-meta hidden text-slate-400 sm:block dark:text-slate-500"
          >
            Invio per aggiungere · Shift+Invio per andare a capo
          </span>

          <UButton
            type="submit"
            color="primary"
            size="md"
            :loading="loading"
            :disabled="!inputTitle.trim() || loading"
            icon="i-lucide-plus"
            class="rounded-xl font-semibold transition-transform active:scale-95"
          >
            Aggiungi
          </UButton>
        </div>
      </div>
    </form>
  </div>
</template>
