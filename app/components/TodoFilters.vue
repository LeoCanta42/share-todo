<script setup lang="ts">
import { SORT_ORDERS, usePreferences } from '~/composables/usePreferences'

/**
 * Filter toolbar: status tabs, origin (mine/shared), search and sort.
 *
 * The group chips that used to live here are gone: picking a group now opens that
 * group's own page, so a chip in the toolbar — narrowing the list you were already
 * reading, with no indication of which group you had landed in — was the confusing
 * part. The counts below follow `scopedStats`, so on a group page they describe the
 * group, not the whole workspace.
 */
const emit = defineEmits<{
  (e: 'clearCompleted'): void
}>()

const {
  filter,
  scope,
  searchQuery,
  scopedStats,
  scopedTodos,
  isShared
} = useTodos()

const { prefs, update } = usePreferences()

const hasSharedTasks = computed(() => scopedTodos.value.some(t => isShared(t)))

const filterOptions = computed(() => [
  { id: 'all', label: 'Tutti', count: scopedStats.value.total },
  { id: 'active', label: 'Da fare', count: scopedStats.value.active },
  { id: 'completed', label: 'Fatti', count: scopedStats.value.completed }
])

const scopeOptions = [
  { id: 'all', label: 'Tutti' },
  { id: 'mine', label: 'Miei' },
  { id: 'shared', label: 'Condivisi' }
]

const hasActiveFilters = computed(() =>
  filter.value !== 'all' || scope.value !== 'all' || searchQuery.value.trim() !== ''
)

function clearFilters() {
  filter.value = 'all'
  scope.value = 'all'
  searchQuery.value = ''
}

const sortModel = computed({
  get: () => prefs.value.sort,
  set: (value: string) => update('sort', value as typeof prefs.value.sort)
})
</script>

<template>
  <div class="space-y-2.5">
    <!-- Status tabs -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 scrollbar-none dark:bg-slate-800/80">
        <button
          v-for="item in filterOptions"
          :key="item.id"
          type="button"
          class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
          :class="filter === item.id
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
          :aria-pressed="filter === item.id"
          @click="filter = item.id as typeof filter"
        >
          <span>{{ item.label }}</span>
          <span
            class="rounded-full px-1.5 text-[10px] font-bold"
            :class="filter === item.id
              ? 'bg-accent-100 text-accent-700 dark:bg-accent-950 dark:text-accent-300'
              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'"
          >
            {{ item.count }}
          </span>
        </button>
      </div>

      <UButton
        v-if="hasActiveFilters"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-filter-x"
        class="rounded-lg"
        @click="clearFilters"
      >
        Azzera
      </UButton>
    </div>

    <!-- Origin (only when someone shared something with you) -->
    <div v-if="hasSharedTasks" class="flex items-center gap-2">
      <span class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Origine</span>
      <div class="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/80">
        <button
          v-for="item in scopeOptions"
          :key="item.id"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
          :class="scope === item.id
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
          :aria-pressed="scope === item.id"
          @click="scope = item.id as typeof scope"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <!-- Search, sort, cleanup -->
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          :value="searchQuery"
          type="search"
          placeholder="Cerca testo o gruppo…"
          class="w-full rounded-xl border border-transparent bg-slate-100 py-1.5 pr-8 pl-8 text-base text-slate-900 transition-all placeholder-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none sm:text-xs dark:bg-slate-800/80 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-900"
          aria-label="Cerca attività"
          @input="searchQuery = ($event.target as HTMLInputElement).value"
        >
        <button
          v-if="searchQuery"
          type="button"
          class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="Cancella la ricerca"
          @click="searchQuery = ''"
        >
          <UIcon name="i-lucide-x" class="h-3.5 w-3.5" />
        </button>
      </div>

      <div class="flex items-center gap-2">
        <div class="relative flex-1 sm:flex-none">
          <UIcon name="i-lucide-arrow-up-down" class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <select
            v-model="sortModel"
            class="w-full appearance-none rounded-xl border border-transparent bg-slate-100 py-1.5 pr-7 pl-8 text-base font-medium text-slate-700 focus:border-accent-500 focus:outline-none sm:w-auto sm:text-xs dark:bg-slate-800/80 dark:text-slate-200"
            aria-label="Ordina le attività"
          >
            <option v-for="order in SORT_ORDERS" :key="order.id" :value="order.id">
              {{ order.label }}
            </option>
          </select>
          <UIcon name="i-lucide-chevron-down" class="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>

        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-xl border transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
          :class="prefs.groupSections
            ? 'border-transparent bg-accent-100 text-accent-700 dark:bg-accent-950/70 dark:text-accent-300'
            : 'border-slate-200 bg-white text-slate-400 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:hover:text-slate-200'"
          :aria-pressed="prefs.groupSections"
          :title="prefs.groupSections ? 'Intestazioni dei gruppi attive' : 'Intestazioni dei gruppi disattivate'"
          @click="update('groupSections', !prefs.groupSections)"
        >
          <UIcon name="i-lucide-list-tree" class="h-4 w-4" />
        </button>

        <UButton
          v-if="scopedStats.completed > 0"
          color="error"
          variant="ghost"
          size="xs"
          icon="i-lucide-trash"
          class="rounded-lg whitespace-nowrap"
          @click="emit('clearCompleted')"
        >
          <span class="hidden sm:inline">Elimina completati</span>
          <span class="sm:hidden">Pulisci</span>
        </UButton>
      </div>
    </div>
  </div>
</template>
