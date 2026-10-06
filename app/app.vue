<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useShares } from '~/composables/useShares'
import { useTodos } from '~/composables/useTodos'
import { useAppearance } from '~/composables/useAppearance'
import { useConfirm } from '~/composables/useConfirm'
import { usePwa } from '~/composables/usePwa'
import type { Todo } from '~/types/todo'

useSeoMeta({
  title: 'ShareToDo — Attività e condivisione',
  description: 'Gestisci attività personali, organizzale in gruppi e condividile con altre persone. Installabile come app.',
  ogTitle: 'ShareToDo',
  ogDescription: 'Attività, gruppi e liste condivise in un\'app veloce e installabile.',
  ogType: 'website'
})

const { user, logout } = useAuth()
const { userEmail } = useCurrentUser()
const { myShares, loadShares, todoPermission } = useShares()
const { prefs } = useAppearance()
const { ask } = useConfirm()
const { needRefresh, offlineReady, updateApp } = usePwa()

const {
  todos,
  isAdding,
  filter,
  scope,
  selectedGroup,
  searchQuery,
  availableGroups,
  stats,
  groupMeta,
  isShared,
  loadTodos,
  addTodo,
  toggleTodo,
  updateTodoTitle,
  updateTodoGroup,
  deleteTodo,
  clearCompleted
} = useTodos()

const toast = useToast()

/* ------------------------------------------------------------------ dialogs */
const isShareModalOpen = ref(false)
const isSettingsModalOpen = ref(false)
const isDetailOpen = ref(false)
const detailId = ref<number | null>(null)

/* ------------------------------------------------------------------ refresh */
const isRefreshing = ref(false)

async function handleRefresh() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await Promise.all([loadTodos(), loadShares()])
    toast.add({
      title: 'Elenco aggiornato',
      color: 'success'
    })
  } finally {
    isRefreshing.value = false
  }
}

/** Derived so the open dialog always shows the latest version of the activity. */
const detailTodo = computed<Todo | null>(
  () => todos.value.find(t => t.id === detailId.value) ?? null
)

const detailMeta = computed(() => groupMeta(detailTodo.value?.group_name))
const detailEditable = computed(() => (detailTodo.value ? todoPermission(detailTodo.value) !== 'read' : true))

function openDetail(todo: Todo) {
  detailId.value = todo.id
  isDetailOpen.value = true
}

/* ------------------------------------------------------------- mutation UX */
function shorten(text: string, max = 140): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 1)}…` : single
}

async function handleDelete(id: number) {
  const todo = todos.value.find(t => t.id === id)
  if (prefs.value.confirmDelete) {
    const confirmed = await ask({
      title: 'Eliminare questa attività?',
      description: todo ? shorten(todo.title) : undefined,
      confirmLabel: 'Elimina',
      tone: 'danger',
      icon: 'i-lucide-trash-2'
    })
    if (!confirmed) return
  }

  if (detailId.value === id) {
    isDetailOpen.value = false
  }
  await deleteTodo(id)
}

async function handleClearCompleted() {
  const count = stats.value.completed
  if (count === 0) return

  if (prefs.value.confirmDelete) {
    const confirmed = await ask({
      title: `Eliminare ${count} attività completate?`,
      description: 'Le attività condivise in sola lettura resteranno nell\'elenco.',
      confirmLabel: 'Elimina completate',
      tone: 'danger',
      icon: 'i-lucide-eraser'
    })
    if (!confirmed) return
  }

  await clearCompleted()
}

function handleDetailSave(payload: { id: number, title: string, group: string }) {
  const todo = todos.value.find(t => t.id === payload.id)
  if (!todo) return
  if (payload.title !== todo.title) {
    updateTodoTitle(payload.id, payload.title)
  }
  if (payload.group !== (todo.group_name || 'Generale')) {
    updateTodoGroup(payload.id, payload.group)
  }
}

function clearFilters() {
  filter.value = 'all'
  scope.value = 'all'
  selectedGroup.value = 'all'
  searchQuery.value = ''
}

/* ------------------------------------------------------- quick add shortcuts */
const focusSignal = ref(0)
function focusNewTodo() {
  focusSignal.value += 1
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

/* -------------------------------------------------------------- PWA notices */
watch(needRefresh, (value) => {
  if (!value) return
  toast.add({
    title: 'Nuova versione disponibile',
    description: 'Aggiorna per usare l\'ultima versione dell\'app.',
    color: 'info',
    duration: 0,
    actions: [{ label: 'Aggiorna', color: 'primary', variant: 'soft', onClick: () => updateApp() }]
  })
})

watch(offlineReady, (value) => {
  if (!value) return
  toast.add({
    title: 'Pronta per l\'uso offline',
    description: 'L\'interfaccia resta disponibile anche senza connessione.',
    color: 'neutral'
  })
})

/* --------------------------------------------------------------- workspace */
// Runs immediately with the current value and again whenever auth changes, so the
// workspace loads on sign-in and is cleared on sign-out. There is deliberately no
// onMounted duplicate here: that would fetch every list twice on each page load.
watch(user, (currentUser) => {
  if (currentUser) {
    loadTodos()
    loadShares()
  } else {
    todos.value = []
    myShares.value = []
    isDetailOpen.value = false
    isSettingsModalOpen.value = false
    isShareModalOpen.value = false
  }
}, { immediate: true })

/* -------------------------------------------------- mobile floating action */
onMounted(() => {
  // Manifest shortcut: /?focus=new focuses the quick-add bar.
  const route = useRoute()
  if (route.query.focus === 'new') {
    focusNewTodo()
  }
})

// Keep the grouped/ungrouped list in sync with the chosen sort order.
const listIsGrouped = computed(() => prefs.value.sort === 'group' && prefs.value.groupSections)
</script>

<template>
  <UApp>
    <div class="app-shell min-h-dvh text-slate-900 transition-colors dark:text-slate-100">
      <!-- Accent wash on its own fixed layer: `background-attachment: fixed` made
           the browser repaint these gradients on every scroll frame. -->
      <div class="app-glow" aria-hidden="true" />

      <AppNavbar
        :user="user"
        :collaborators-count="myShares.length"
        :refreshing="isRefreshing"
        @open-share="isShareModalOpen = true"
        @open-settings="isSettingsModalOpen = true"
        @logout="logout"
        @refresh="handleRefresh"
      />

      <!-- Unauthenticated: the sign-in screen -->
      <main v-if="!user" class="mx-auto max-w-3xl px-4 sm:px-6">
        <AuthView />
      </main>

      <!-- Authenticated: the workspace -->
      <main v-else class="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-24 sm:space-y-6 sm:px-6 sm:pt-8 sm:pb-14">
        <TodoHeader :stats="stats" :user-email="userEmail" />

        <section aria-label="Aggiungi attività">
          <TodoInput
            :loading="isAdding"
            :available-groups="availableGroups"
            :default-group="selectedGroup !== 'all' ? selectedGroup : 'Generale'"
            :focus-signal="focusSignal"
            @add="(title, group) => addTodo(title, group)"
          />
        </section>

        <section v-if="stats.total > 0" aria-label="Filtri e ricerca">
          <TodoFilters @clear-completed="handleClearCompleted" />
        </section>

        <section aria-label="Elenco attività">
          <TodoList
            @toggle="toggleTodo"
            @update-title="updateTodoTitle"
            @update-group="updateTodoGroup"
            @filter-group="(grp) => selectedGroup = grp"
            @open-detail="openDetail"
            @delete="handleDelete"
            @clear-filters="clearFilters"
            @create="focusNewTodo"
          />
        </section>

        <footer class="space-y-1 pt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          <p>Organizza le tue attività in gruppi e condividile in tempo reale.</p>
        </footer>
      </main>

      <!-- Dialogs -->
      <TodoDetailModal
        v-if="detailTodo"
        v-model:open="isDetailOpen"
        :todo="detailTodo"
        :groups="availableGroups"
        :is-shared="isShared(detailTodo)"
        :can-edit="detailEditable"
        :group-icon="detailMeta.icon"
        :group-color-class="detailMeta.colorClass"
        @toggle="toggleTodo"
        @save="handleDetailSave"
        @delete="handleDelete"
        @filter-group="(grp) => { selectedGroup = grp }"
      />

      <LazySettingsModal v-model:open="isSettingsModalOpen" />
      <LazyShareModal v-model:open="isShareModalOpen" />
      <AppConfirmDialog />

      <!-- Mobile shortcut back to the quick-add bar. Own component on purpose:
           the scroll flag lives there so scrolling never re-renders the app root. -->
      <AppFab v-if="user" @activate="focusNewTodo" />
    </div>
  </UApp>
</template>
