<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useShares } from '~/composables/useShares'
import { useTodos } from '~/composables/useTodos'

useSeoMeta({
  title: 'Nuxt Todo - Modern Supabase Task Manager',
  description: 'A clean, modern task manager built with Nuxt 4, Supabase, and Nuxt UI.'
})

const { user, logout } = useAuth()
const { myShares, loadShares, shareList, removeShare, isSharing } = useShares()

const {
  todos,
  loading,
  isAdding,
  activeActionId,
  filter,
  scope,
  selectedGroup,
  searchQuery,
  availableGroups,
  groupStats,
  filteredTodos,
  stats,
  isShared,
  loadTodos,
  addTodo,
  toggleTodo,
  updateTodoTitle,
  updateTodoGroup,
  deleteTodo,
  clearCompleted
} = useTodos()

const isShareModalOpen = ref(false)

const hasSharedTasks = computed(() => {
  return todos.value.some(t => isShared(t))
})

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
  }
}, { immediate: true })
</script>

<template>
  <UApp>
    <div class="min-h-screen bg-gradient-to-b from-gray-50 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
      <AppNavbar
        :user="user"
        :collaborators-count="myShares.length"
        @open-share="isShareModalOpen = true"
        @logout="logout"
      />

      <!-- If user is not authenticated: Show Auth View -->
      <main v-if="!user" class="max-w-3xl mx-auto px-4 sm:px-6">
        <AuthView />
      </main>

      <!-- If user is authenticated: Show Main Todo Workspace -->
      <main v-else class="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <!-- Banner with Date, Greeting & Progress -->
        <TodoHeader :stats="stats" />

        <!-- Add Task Input with Subgroup Picker -->
        <section aria-label="Aggiungi attività">
          <TodoInput
            :loading="isAdding"
            :available-groups="availableGroups"
            :default-group="selectedGroup !== 'all' ? selectedGroup : 'Generale'"
            @add="(title, group) => addTodo(title, group)"
          />
        </section>

        <!-- Filters & Search Toolbar with Subgroups & Scope -->
        <section v-if="stats.total > 0" aria-label="Filtri e ricerca">
          <TodoFilters
            v-model:filter="filter"
            v-model:scope="scope"
            v-model:selected-group="selectedGroup"
            v-model:search-query="searchQuery"
            :stats="stats"
            :available-groups="availableGroups"
            :group-stats="groupStats"
            :has-shared-todos="hasSharedTasks"
            @clear-completed="clearCompleted"
          />
        </section>

        <!-- Task List -->
        <section aria-label="Elenco attività">
          <TodoList
            :todos="filteredTodos"
            :loading="loading"
            :active-action-id="activeActionId"
            :total-count="stats.total"
            :filter="filter"
            :selected-group="selectedGroup"
            :search-query="searchQuery"
            :available-groups="availableGroups"
            :is-shared="isShared"
            @toggle="toggleTodo"
            @update-title="updateTodoTitle"
            @update-group="updateTodoGroup"
            @filter-group="(grp) => selectedGroup = grp"
            @delete="deleteTodo"
          />
        </section>

        <!-- Share Modal -->
        <ShareModal
          v-model:is-open="isShareModalOpen"
          :shares="myShares"
          :is-sharing="isSharing"
          :available-groups="availableGroups"
          @share="(email, perm, group) => shareList(email, perm, group)"
          @remove="(id) => removeShare(id)"
        />

        <!-- Quick tips / footer -->
        <footer class="pt-8 text-center text-xs text-gray-400 dark:text-gray-500 space-y-1">
          <p>Organizza i tuoi task in sottogruppi e condividi le liste in tempo reale.</p>
          <p class="text-[11px] opacity-75">Protetto da Supabase Row Level Security (RLS)</p>
        </footer>
      </main>
    </div>
  </UApp>
</template>