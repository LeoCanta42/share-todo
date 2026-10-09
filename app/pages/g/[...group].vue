<script setup lang="ts">
import { useGroups } from '~/composables/useGroups'
import { useTodos } from '~/composables/useTodos'
import { useNotes } from '~/composables/useNotes'
import { useShareDialog } from '~/composables/useShareDialog'
import { useConfirm } from '~/composables/useConfirm'
import { groupMetaOf } from '~/utils/groups'
import { haptic } from '~/utils/haptics'
import type { GroupNode } from '~/types/group'

/**
 * A page dedicated to one group — and, because a grant on a group covers its
 * sub-groups, to everything filed underneath it.
 *
 * The route carries the *name path* (`/g/Lavoro/Clienti`): that is what a person can
 * read, keep in a bookmark and recognise in a link, while the group itself is
 * identified by id everywhere else. The name is unique among its siblings (a
 * database constraint), which is what makes the path unambiguous.
 */
const route = useRoute()

const { groups, loading: groupsLoading, tree, namePath, fromNamePath, isOwn, removeGroup } = useGroups()
const { selectedGroupId, scopedStats, scopedTodos, groupCounts, loadTodos, toggleTodos } = useTodos()
const { noteCountsDeep, loadNotes } = useNotes()
const { openShare } = useShareDialog()
const { ask } = useConfirm()
const toast = useToast()

/** What the URL asked for, as names: [], ['Lavoro'] or ['Lavoro', 'Clienti']. */
const askedPath = computed<string[]>(() => {
  const raw = route.params.group
  const parts = Array.isArray(raw) ? raw : [String(raw ?? '')]
  return parts.map(part => part.trim()).filter(Boolean)
})

const group = computed(() => fromNamePath(askedPath.value))
const meta = computed(() => groupMetaOf(group.value, askedPath.value.join('/')))
const counts = computed(() => (group.value ? groupCounts.value[group.value.id] : undefined))
const noteCount = computed(() => (group.value ? noteCountsDeep.value[group.value.id] ?? 0 : 0))

/** The chain shown in the header, root first. */
const breadcrumb = computed(() => (group.value ? namePath(group.value.id) : askedPath.value))

/** Direct sub-groups, offered as links deeper into the tree. */
const children = computed<GroupNode[]>(() =>
  group.value ? findNode(tree.value, group.value.id)?.children ?? [] : []
)

function findNode(nodes: GroupNode[], id: string): GroupNode | null {
  for (const node of nodes) {
    if (node.group.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

const isDefaultGroup = computed(() =>
  Boolean(group.value && group.value.parent_id === null
    && group.value.name.trim().toLowerCase() === 'generale')
)

const canDelete = computed(() => Boolean(group.value && isOwn(group.value) && !isDefaultGroup.value))

/** Nothing here, and the name is not one this account can see: a stale link. */
const looksUnknown = computed(() =>
  !groupsLoading.value && !group.value && scopedStats.value.total === 0 && noteCount.value === 0
)

// The shared selection follows whatever the URL points at. It waits for the tree to
// arrive, so a deep link (or a reload) does not flash "everything" first.
watch([() => groups.value, askedPath], () => {
  const found = fromNamePath(askedPath.value)
  if (found) selectedGroupId.value = found.id
}, { immediate: true })

// A deleted group (or one reached with a stale link) must not leave the list
// filtered by something that no longer exists.
onBeforeUnmount(() => {
  selectedGroupId.value = 'all'
})

async function requestDelete() {
  const current = group.value
  if (!current) return

  const total = counts.value?.total.total ?? 0
  const subGroups = children.value.length

  const confirmed = await ask({
    title: `Eliminare il gruppo "${current.name}"?`,
    description: [
      total > 0
        ? `${total} attività verranno spostate nel gruppo "Generale".`
        : 'Il gruppo non contiene attività.',
      subGroups > 0
        ? `I ${subGroups} sottogruppi saranno eliminati con esso, e le loro attività torneranno in "Generale".`
        : '',
      noteCount.value > 0
        ? `Le sue ${noteCount.value} note resteranno nel gruppo finché non le sposti.`
        : ''
    ].filter(Boolean).join(' '),
    confirmLabel: 'Elimina gruppo',
    tone: 'danger',
    icon: 'i-lucide-folder-x'
  })

  if (!confirmed) return

  const done = await removeGroup(current.id)
  if (!done) return

  // The database re-homed the activities, so the list has to be re-read.
  await Promise.all([loadTodos(), loadNotes()])
  toast.add({
    title: 'Gruppo eliminato',
    description: `${current.name} non c'è più.`,
    color: 'neutral'
  })
  await navigateTo('/')
}

function handleToggleAllInGroup() {
  haptic(12)
  toggleTodos(scopedTodos.value)
}
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-24 sm:space-y-6 sm:px-6 sm:pt-8 sm:pb-14">
    <!-- Group header -->
    <section class="anim-rise surface-card rounded-3xl p-4 sm:p-5">
      <div class="flex items-start gap-3">
        <NuxtLink
          :to="breadcrumb.length > 1 ? { name: 'g-group', params: { group: breadcrumb.slice(0, -1) } } : '/'"
          class="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:hover:bg-slate-800 dark:hover:text-white"
          :aria-label="breadcrumb.length > 1 ? 'Torna al gruppo superiore' : 'Torna alla panoramica'"
          :title="breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2] : 'Panoramica'"
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
          <!-- The path, so it is always obvious where in the tree you are. -->
          <nav v-if="breadcrumb.length > 1" class="todo-meta mb-0.5 flex flex-wrap items-center gap-1 text-slate-400 dark:text-slate-500" aria-label="Percorso del gruppo">
            <template v-for="(part, index) in breadcrumb" :key="part">
              <NuxtLink
                v-if="index < breadcrumb.length - 1"
                :to="{ name: 'g-group', params: { group: breadcrumb.slice(0, index + 1) } }"
                class="hover:text-accent-700 dark:hover:text-accent-300"
              >{{ part }}</NuxtLink>
              <span v-else class="font-semibold text-slate-500 dark:text-slate-400">{{ part }}</span>
              <span v-if="index < breadcrumb.length - 1" aria-hidden="true">/</span>
            </template>
          </nav>

          <h2 class="truncate text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
            {{ group?.name ?? askedPath.join(' / ') ?? 'Gruppo' }}
          </h2>
          <p class="todo-meta mt-0.5 text-slate-500 dark:text-slate-400">
            {{ counts?.total.total ?? 0 }} attività
            · {{ counts?.total.active ?? 0 }} da fare
            · {{ counts?.total.completed ?? 0 }} completate
            <template v-if="noteCount > 0"> · {{ noteCount }} note</template>
          </p>
        </div>

        <div class="flex flex-shrink-0 items-center gap-1">
          <UButton
            v-if="scopedTodos.length > 0"
            color="neutral"
            variant="soft"
            size="sm"
            :icon="counts?.total.completed === counts?.total.total ? 'i-lucide-check-check' : 'i-lucide-check'"
            class="rounded-xl"
            :title="counts?.total.completed === counts?.total.total ? 'Deseleziona tutte le attività del gruppo' : 'Seleziona tutte le attività del gruppo'"
            :aria-label="counts?.total.completed === counts?.total.total ? 'Deseleziona tutte le attività del gruppo' : 'Seleziona tutte le attività del gruppo'"
            @click="handleToggleAllInGroup"
          >
            <span class="hidden sm:inline">{{ counts?.total.completed === counts?.total.total ? 'Deseleziona tutti' : 'Seleziona tutti' }}</span>
          </UButton>

          <UButton
            v-if="group && isOwn(group)"
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-share-2"
            class="rounded-xl"
            title="Condividi questo gruppo"
            aria-label="Condividi questo gruppo"
            @click="openShare(group.id)"
          >
            <span class="hidden sm:inline">Condividi</span>
          </UButton>

          <UButton
            v-if="canDelete"
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

      <!-- Sub-groups, one tap away -->
      <div v-if="children.length" class="mt-3 flex flex-wrap gap-1.5">
        <NuxtLink
          v-for="child in children"
          :key="child.group.id"
          :to="{ name: 'g-group', params: { group: namePath(child.group.id) } }"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
          :class="groupMetaOf(child.group).colorClass"
        >
          <UIcon :name="groupMetaOf(child.group).icon" class="h-3.5 w-3.5" />
          <span>{{ child.group.name }}</span>
          <span class="opacity-70">{{ groupCounts[child.group.id]?.total.total ?? 0 }}</span>
        </NuxtLink>
      </div>

      <p
        v-if="looksUnknown"
        class="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        role="status"
      >
        <UIcon name="i-lucide-info" class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          «{{ askedPath.join(' / ') }}» non è tra i tuoi gruppi e non contiene nulla. Potresti essere arrivato
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

      <NotesPanel :group-id="group?.id ?? null" />
    </section>
  </main>
</template>
