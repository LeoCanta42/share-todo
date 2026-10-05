<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'

useSeoMeta({
  title: 'Nuxt Todo - Modern Supabase Task Manager',
  description: 'A clean, modern task manager built with Nuxt 4, Supabase, and Nuxt UI.'
})

const {
  todos,
  loading,
  isAdding,
  activeActionId,
  filter,
  selectedGroup,
  searchQuery,
  availableGroups,
  groupStats,
  filteredTodos,
  stats,
  loadTodos,
  addTodo,
  toggleTodo,
  updateTodoTitle,
  updateTodoGroup,
  deleteTodo,
  clearCompleted
} = useTodos()

onMounted(() => {
  loadTodos()
})
</script>

<template>
  <UApp>
    <div class="min-h-screen bg-gradient-to-b from-gray-50 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
      <AppNavbar />

      <main class="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <!-- Banner with Date & Progress -->
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

        <!-- Filters & Search Toolbar with Subgroups -->
        <section v-if="stats.total > 0" aria-label="Filtri e ricerca">
          <TodoFilters
            v-model:filter="filter"
            v-model:selected-group="selectedGroup"
            v-model:search-query="searchQuery"
            :stats="stats"
            :available-groups="availableGroups"
            :group-stats="groupStats"
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
            @toggle="toggleTodo"
            @update-title="updateTodoTitle"
            @update-group="updateTodoGroup"
            @filter-group="(grp) => selectedGroup = grp"
            @delete="deleteTodo"
          />
        </section>

        <!-- Quick tips / footer -->
        <footer class="pt-8 text-center text-xs text-gray-400 dark:text-gray-500 space-y-1">
          <p>Organizza i tuoi task in sottogruppi (es. Lavoro, Casa, Studio, Progetti).</p>
          <p class="text-[11px] opacity-75">Sincronizzato in tempo reale con Supabase Database</p>
        </footer>
      </main>
    </div>
  </UApp>
</template>