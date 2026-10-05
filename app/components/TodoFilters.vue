<script setup lang="ts">
import type { TodoFilter, TodoStats } from '~/types/todo'
import { getGroupMeta } from '~/utils/groups'

const props = defineProps<{
  filter: TodoFilter
  selectedGroup: string
  searchQuery: string
  stats: TodoStats
  availableGroups: string[]
  groupStats: Record<string, { total: number; active: number; completed: number }>
}>()

const emit = defineEmits<{
  (e: 'update:filter', value: TodoFilter): void
  (e: 'update:selectedGroup', value: string): void
  (e: 'update:searchQuery', value: string): void
  (e: 'clearCompleted'): void
}>()

const filterOptions = computed<{ label: string; value: TodoFilter; count: number }[]>(() => [
  { label: 'Tutti', value: 'all', count: props.stats.total },
  { label: 'Da fare', value: 'active', count: props.stats.active },
  { label: 'Completati', value: 'completed', count: props.stats.completed }
])

// Only show groups that have at least 1 task or are selected
const activeGroupsWithTasks = computed(() => {
  return props.availableGroups.filter(g => {
    const hasCount = props.groupStats[g]?.total > 0
    return hasCount || props.selectedGroup === g
  })
})
</script>

<template>
  <div class="space-y-3 pt-2">
    <!-- Subgroups Filter Chips -->
    <div v-if="activeGroupsWithTasks.length > 0" class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap mr-1">
        Gruppo:
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border"
        :class="[
          selectedGroup === 'all'
            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent shadow-xs'
            : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
        ]"
        @click="emit('update:selectedGroup', 'all')"
      >
        <span>Tutti</span>
        <span class="text-[10px] opacity-75">({{ stats.total }})</span>
      </button>

      <button
        v-for="grp in activeGroupsWithTasks"
        :key="grp"
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border"
        :class="[
          selectedGroup === grp
            ? 'ring-2 ring-emerald-500 border-transparent ' + getGroupMeta(grp).colorClass
            : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
        ]"
        @click="emit('update:selectedGroup', grp)"
      >
        <UIcon :name="getGroupMeta(grp).icon" class="w-3.5 h-3.5" />
        <span>{{ grp }}</span>
        <span class="text-[10px] opacity-75">({{ groupStats[grp]?.total || 0 }})</span>
      </button>
    </div>

    <!-- Status Filters & Search Bar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <!-- Status Tabs -->
      <div class="inline-flex p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl gap-1">
        <button
          v-for="item in filterOptions"
          :key="item.value"
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          :class="[
            filter === item.value
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          ]"
          @click="emit('update:filter', item.value)"
        >
          <span>{{ item.label }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
            :class="[
              filter === item.value
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            ]"
          >
            {{ item.count }}
          </span>
        </button>
      </div>

      <!-- Search & Clear completed -->
      <div class="flex items-center gap-2">
        <div class="relative flex-1 sm:w-48">
          <UIcon
            name="i-lucide-search"
            class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
          />
          <input
            :value="searchQuery"
            type="text"
            placeholder="Cerca per testo o gruppo..."
            class="w-full pl-8 pr-7 py-1.5 bg-gray-100 dark:bg-gray-800/80 rounded-xl text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none transition-all"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          >
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
            @click="emit('update:searchQuery', '')"
          >
            <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
          </button>
        </div>

        <UButton
          v-if="stats.completed > 0"
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-trash"
          class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          @click="emit('clearCompleted')"
        >
          <span class="hidden sm:inline">Elimina completati</span>
        </UButton>
      </div>
    </div>
  </div>
</template>
