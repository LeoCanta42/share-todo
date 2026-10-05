<script setup lang="ts">
import type { TodoFilter } from '~/types/todo'

const props = defineProps<{
  totalCount: number
  filter: TodoFilter
  searchQuery?: string
}>()

const isFiltering = computed(() => props.filter !== 'all' || Boolean(props.searchQuery))
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-12 px-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
    <div class="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3.5 shadow-inner">
      <UIcon
        :name="isFiltering ? 'i-lucide-filter-x' : 'i-lucide-check-circle-2'"
        class="w-7 h-7"
      />
    </div>

    <h3 class="font-semibold text-base text-gray-900 dark:text-white">
      {{ isFiltering ? 'Nessun risultato trovato' : 'Tutto completato o nessun task' }}
    </h3>

    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
      <span v-if="searchQuery">
        Nessuna attività corrisponde alla ricerca "{{ searchQuery }}".
      </span>
      <span v-else-if="filter === 'completed'">
        Non ci sono ancora attività completate.
      </span>
      <span v-else-if="filter === 'active'">
        Nessuna attività in sospeso! Ottimo lavoro.
      </span>
      <span v-else>
        La tua lista è vuota. Aggiungi una nuova attività usando il campo in alto per iniziare.
      </span>
    </p>
  </div>
</template>
