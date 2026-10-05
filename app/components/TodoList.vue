<script setup lang="ts">
import type { Todo, TodoFilter } from '~/types/todo'

defineProps<{
  todos: Todo[]
  loading?: boolean
  activeActionId?: number | null
  totalCount: number
  filter: TodoFilter
  selectedGroup: string
  searchQuery?: string
  availableGroups?: string[]
}>()

const emit = defineEmits<{
  (e: 'toggle', todo: Todo): void
  (e: 'updateTitle', id: number, newTitle: string): void
  (e: 'updateGroup', id: number, newGroup: string): void
  (e: 'filterGroup', group: string): void
  (e: 'delete', id: number): void
}>()
</script>

<template>
  <div class="space-y-2">
    <!-- Loading skeleton -->
    <div v-if="loading && todos.length === 0" class="space-y-3">
      <div
        v-for="i in 3"
        :key="i"
        class="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl animate-pulse"
      >
        <div class="w-5 h-5 rounded-lg bg-gray-200 dark:bg-gray-800" />
        <div class="flex-1 space-y-2">
          <div class="h-3.5 bg-gray-200 dark:bg-gray-800 rounded w-2/3" />
        </div>
        <div class="w-6 h-6 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>

    <!-- Empty state -->
    <TodoEmpty
      v-else-if="todos.length === 0"
      :total-count="totalCount"
      :filter="filter"
      :search-query="searchQuery"
    />

    <!-- Todo items with animations -->
    <TransitionGroup
      v-else
      tag="div"
      name="todo-list"
      class="space-y-2"
    >
      <TodoItem
        v-for="todo in todos"
        :key="todo.id"
        :todo="todo"
        :is-pending="activeActionId === todo.id"
        :available-groups="availableGroups"
        @toggle="emit('toggle', $event)"
        @update-title="(id, title) => emit('updateTitle', id, title)"
        @update-group="(id, group) => emit('updateGroup', id, group)"
        @filter-group="(grp) => emit('filterGroup', grp)"
        @delete="emit('delete', $event)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.todo-list-enter-active,
.todo-list-leave-active {
  transition: all 0.25s ease-out;
}
.todo-list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.todo-list-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
.todo-list-move {
  transition: transform 0.25s ease;
}
</style>
