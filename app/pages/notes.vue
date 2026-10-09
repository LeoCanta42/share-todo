<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'
import { useNotes } from '~/composables/useNotes'
import { useQuickAdd } from '~/composables/useQuickAdd'

/**
 * All the notes, with a group filter.
 *
 * The composer opens in "Note" mode here — this page is about notes, so the switch
 * starts where the user expects it.
 */
const { stats } = useNotes()
const { selectedGroupId } = useTodos()
const { tree } = useGroups()
const { focusSignal, focusQuickAdd } = useQuickAdd()

const route = useRoute()

// The notes page shows every note regardless of which group page was visited before.
selectedGroupId.value = 'all'

onMounted(() => {
  // Manifest shortcut: /notes?focus=new focuses the note composer, the same way
  // /?focus=new focuses the quick-add bar on the overview.
  if (route.query.focus === 'new') {
    focusQuickAdd()
  }
})
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-24 sm:space-y-6 sm:px-6 sm:pt-8 sm:pb-14">
    <section class="anim-rise surface-card rounded-3xl p-4 sm:p-5">
      <div class="flex items-center gap-3">
        <span class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-400">
          <UIcon name="i-lucide-notebook-pen" class="h-6 w-6" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
            Note
          </h2>
          <p class="todo-meta mt-0.5 text-slate-500 dark:text-slate-400">
            {{ stats.total }} {{ stats.total === 1 ? 'nota' : 'note' }}
            <template v-if="stats.groups > 0"> · in {{ stats.groups }} gruppi</template>
          </p>
        </div>
      </div>
    </section>

    <section aria-label="Aggiungi una nota">
      <QuickAdd
        :tree="tree"
        :focus-signal="focusSignal"
        default-mode="note"
      />
    </section>

    <NotesPanel />

    <footer class="space-y-1 pt-6 text-center text-xs text-slate-400 dark:text-slate-500">
      <p>Le note seguono la condivisione per gruppo: chi vede il gruppo, vede le sue note.</p>
    </footer>
  </main>
</template>
