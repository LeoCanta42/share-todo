<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'
import { useNotes } from '~/composables/useNotes'
import { useShareDialog } from '~/composables/useShareDialog'
import { useConfirm } from '~/composables/useConfirm'

/**
 * A page dedicated to one group: its activities and its notes.
 *
 * The group is identified by the route, so the page can be linked, bookmarked and
 * reloaded, and the browser's Back button returns to whatever you were looking at
 * before. `selectedGroup` is the shared state the list filters on, so it is simply
 * pushed from the route here.
 */
const route = useRoute()

const {
  selectedGroup,
  scopedStats,
  availableGroups,
  groupMeta,
  isFallbackGroup,
  deleteGroup
} = useTodos()
const { noteCounts } = useNotes()
const { openShare } = useShareDialog()
const { ask } = useConfirm()

const groupName = computed(() => {
  const raw = route.params.group
  const value = Array.isArray(raw) ? raw[0] : raw
  return (value ?? '').toString().trim() || 'Generale'
})

// In-place parameter changes (/g/A -> /g/B) reuse this component, so the shared
// filter has to follow the route on every change, not just on mount.
watch(groupName, (name) => {
  selectedGroup.value = name
}, { immediate: true })

const meta = computed(() => groupMeta(groupName.value))
const noteCount = computed(() => noteCounts.value[groupName.value] ?? 0)

const isKnownGroup = computed(() =>
  availableGroups.value.some(g => g.toLowerCase() === groupName.value.toLowerCase())
)

/** Nothing here yet and the name is not one the app knows: likely a stale link. */
const looksUnknown = computed(() => !isKnownGroup.value && scopedStats.value.total === 0 && noteCount.value === 0)

async function requestDelete() {
  const name = groupName.value
  const count = scopedStats.value.total

  const confirmed = await ask({
    title: `Eliminare il gruppo "${name}"?`,
    description: [
      count > 0
        ? `${count} attività verranno spostate nel gruppo "Generale".`
        : 'Il gruppo non contiene attività.',
      noteCount.value > 0
        ? `Le sue ${noteCount.value} note resteranno nel gruppo "${name}" finché non le sposti.`
        : ''
    ].filter(Boolean).join(' '),
    confirmLabel: 'Elimina gruppo',
    tone: 'danger',
    icon: 'i-lucide-folder-x'
  })

  if (!confirmed) return

  const done = await deleteGroup(name)
  if (done) {
    await navigateTo('/')
  }
}
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-24 sm:space-y-6 sm:px-6 sm:pt-8 sm:pb-14">
    <!-- Group header -->
    <section class="anim-rise surface-card rounded-3xl p-4 sm:p-5">
      <div class="flex items-start gap-3">
        <NuxtLink
          to="/"
          class="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label="Torna alla panoramica"
          title="Panoramica"
        >
          <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
        </NuxtLink>

        <span
          class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl"
          :class="meta.colorClass"
        >
          <UIcon :name="meta.icon" class="h-6 w-6" />
        </span>

        <div class="min-w-0 flex-1">
          <h2 class="truncate text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
            {{ groupName }}
          </h2>
          <p class="todo-meta mt-0.5 text-slate-500 dark:text-slate-400">
            {{ scopedStats.total }} {{ scopedStats.total === 1 ? 'attività' : 'attività' }}
            · {{ scopedStats.active }} da fare
            · {{ scopedStats.completed }} completate
            <template v-if="noteCount > 0"> · {{ noteCount }} note</template>
          </p>
        </div>

        <div class="flex flex-shrink-0 items-center gap-1">
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-share-2"
            class="rounded-xl"
            title="Condividi questo gruppo"
            aria-label="Condividi questo gruppo"
            @click="openShare(groupName)"
          >
            <span class="hidden sm:inline">Condividi</span>
          </UButton>

          <UButton
            v-if="!isFallbackGroup(groupName)"
            color="error"
            variant="ghost"
            size="sm"
            icon="i-lucide-trash-2"
            class="rounded-xl"
            title="Elimina questo gruppo"
            aria-label="Elimina questo gruppo"
            @click="requestDelete"
          />
        </div>
      </div>

      <p
        v-if="looksUnknown"
        class="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        role="status"
      >
        <UIcon name="i-lucide-info" class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          «{{ groupName }}» non è tra i tuoi gruppi e non contiene nulla. Potresti essere arrivato
          da un link vecchio: crea qui la prima attività o
          <NuxtLink to="/" class="font-semibold underline">torna alla panoramica</NuxtLink>.
        </span>
      </p>
    </section>

    <WorkspaceView />

    <section class="space-y-2.5" aria-label="Note del gruppo">
      <div class="flex items-center gap-2 px-1">
        <h2 class="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
          Note del gruppo
        </h2>
        <span class="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-800" />
      </div>

      <NotesPanel :group="groupName" />
    </section>
  </main>
</template>
