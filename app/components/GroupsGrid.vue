<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'

/**
 * Overview navigation: one card per group, plus the notes.
 *
 * This is what replaced the group chips in the filter toolbar. Selecting a group
 * used to silently narrow the list you were already looking at — now it takes you
 * to a page that is *about* that group, so there is never a doubt about what the
 * list in front of you contains.
 */
const props = defineProps<{
  /** Note totals per group, from `useNotes()`. */
  noteCounts: Record<string, number>
}>()

const { availableGroups, groupStats, groupMeta } = useTodos()

const cards = computed(() => availableGroups.value.map(name => {
  const stats = groupStats.value[name]
  return {
    name,
    meta: groupMeta(name),
    todos: stats?.total ?? 0,
    active: stats?.active ?? 0,
    notes: props.noteCounts[name] ?? 0
  }
}))

const totalNotes = computed(() =>
  Object.values(props.noteCounts).reduce((sum, count) => sum + count, 0)
)
</script>

<template>
  <section class="space-y-2.5" aria-label="I tuoi gruppi">
    <div class="flex items-center gap-2 px-1">
      <h2 class="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
        I tuoi gruppi
      </h2>
      <span class="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-800" />
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <NuxtLink
        v-for="card in cards"
        :key="card.name"
        :to="{ name: 'g-group', params: { group: card.name } }"
        class="anim-rise group flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-left transition-all hover:border-accent-500/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500/40"
      >
        <span
          class="flex h-9 w-9 items-center justify-center rounded-xl"
          :class="card.meta.colorClass"
        >
          <UIcon :name="card.meta.icon" class="h-4.5 w-4.5" />
        </span>

        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {{ card.name }}
          </span>
          <span class="todo-meta mt-0.5 block text-slate-400 dark:text-slate-500">
            {{ card.todos }} {{ card.todos === 1 ? 'attività' : 'attività' }}
            <template v-if="card.notes > 0"> · {{ card.notes }} note</template>
          </span>
          <span
            v-if="card.active > 0"
            class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold text-accent-700 dark:bg-accent-950/60 dark:text-accent-300"
          >
            {{ card.active }} da fare
          </span>
        </span>
      </NuxtLink>

      <!-- Notes have no group of their own, so they get their own card. -->
      <NuxtLink
        to="/notes"
        class="anim-rise group flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-left transition-all hover:border-accent-500/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500/40"
      >
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <UIcon name="i-lucide-notebook-pen" class="h-4.5 w-4.5" />
        </span>

        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            Tutte le note
          </span>
          <span class="todo-meta mt-0.5 block text-slate-400 dark:text-slate-500">
            {{ totalNotes }} {{ totalNotes === 1 ? 'nota' : 'note' }}
          </span>
        </span>
      </NuxtLink>
    </div>
  </section>
</template>
