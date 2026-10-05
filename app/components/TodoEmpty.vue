<script setup lang="ts">
import type { TodoFilter } from '~/types/todo'

const props = defineProps<{
  totalCount: number
  isFiltering: boolean
  filter: TodoFilter
  searchQuery?: string
  selectedGroup?: string
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
  (e: 'create'): void
}>()

const headline = computed(() => {
  if (props.isFiltering) return 'Nessun risultato'
  if (props.totalCount === 0) return 'Inizia da qui'
  return 'Niente da fare'
})

const message = computed(() => {
  if (props.searchQuery?.trim()) {
    return `Nessuna attività corrisponde a “${props.searchQuery.trim()}”. Prova con un'altra parola.`
  }
  if (props.selectedGroup && props.selectedGroup !== 'all') {
    return `Il gruppo “${props.selectedGroup}” non ha attività da mostrare con i filtri attuali.`
  }
  if (props.filter === 'completed') {
    return 'Non ci sono ancora attività completate.'
  }
  if (props.filter === 'active') {
    return 'Nessuna attività in sospeso: ottimo lavoro!'
  }
  if (props.totalCount === 0) {
    return 'La tua lista è vuota. Aggiungi la prima attività: potrai anche scriverne una lunga e leggerla con calma.'
  }
  return 'Tutto completato o nascosto dai filtri attuali.'
})
</script>

<template>
  <div class="anim-rise flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-4 py-12 text-center dark:border-slate-800 dark:bg-slate-900/30">
    <div class="mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 shadow-inner dark:bg-accent-950/50 dark:text-accent-400">
      <UIcon
        :name="isFiltering ? 'i-lucide-filter-x' : totalCount === 0 ? 'i-lucide-sparkles' : 'i-lucide-check-circle-2'"
        class="h-7 w-7"
      />
    </div>

    <h3 class="text-base font-semibold text-slate-900 dark:text-white">
      {{ headline }}
    </h3>
    <p class="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
      {{ message }}
    </p>

    <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
      <UButton
        v-if="isFiltering"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-filter-x"
        class="rounded-xl"
        @click="emit('clearFilters')"
      >
        Azzera i filtri
      </UButton>
      <UButton
        v-if="totalCount === 0 && !isFiltering"
        color="primary"
        size="sm"
        icon="i-lucide-plus"
        class="rounded-xl font-semibold"
        @click="emit('create')"
      >
        Aggiungi la prima attività
      </UButton>
    </div>
  </div>
</template>
