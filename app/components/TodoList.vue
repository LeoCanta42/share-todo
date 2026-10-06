<script setup lang="ts">
import type { Todo } from '~/types/todo'
import type { GroupMeta } from '~/utils/groups'
import { usePreferences } from '~/composables/usePreferences'
import { useShares } from '~/composables/useShares'

interface Row {
  todo: Todo
  meta: GroupMeta
  shared: boolean
  canEdit: boolean
}

/**
 * The list itself. Reads the shared todo state directly (it is `useState`-backed)
 * and only forwards user intent upwards, where the confirmation rules live.
 */
const emit = defineEmits<{
  (e: 'toggle', todo: Todo): void
  (e: 'updateTitle', id: number, newTitle: string): void
  (e: 'updateGroup', id: number, newGroup: string): void
  (e: 'delete', id: number): void
  (e: 'openDetail', todo: Todo): void
  (e: 'openGroup', group: string): void
  (e: 'clearFilters'): void
  (e: 'create'): void
}>()

const {
  filteredTodos,
  groupedTodos,
  loading,
  activeActionId,
  filter,
  scope,
  searchQuery,
  availableGroups,
  scopedStats,
  isShared,
  groupMeta
} = useTodos()

const { prefs } = usePreferences()
const { permissionFor } = useShares()

const useSections = computed(() => prefs.value.sort === 'group' && prefs.value.groupSections)

/**
 * The group is deliberately not part of this: on `/g/:group` the scope comes from
 * the route, so treating it as a "filter" would offer an "Azzera i filtri" button
 * that empties the page it is on.
 */
const isFiltering = computed(() =>
  filter.value !== 'all' || scope.value !== 'all' || searchQuery.value.trim() !== ''
)

/**
 * Row view-models are built once per data change rather than being derived inside
 * the template. That matters for more than tidiness: `groupMeta()` now returns a
 * memoised object and the permission flags are plain booleans, so rows whose data
 * did not change receive identical props and Vue skips re-rendering them — the
 * difference between patching one row and patching all of them on every action.
 */
function toRows(todos: Todo[]): Row[] {
  return todos.map(todo => ({
    todo,
    meta: groupMeta(todo.group_name),
    shared: isShared(todo),
    canEdit: permissionFor(todo) !== 'read'
  }))
}

const rows = computed<Row[]>(() => toRows(filteredTodos.value))

const sections = computed(() => groupedTodos.value.map(section => ({
  name: section.name,
  meta: section.meta,
  rows: toRows(section.todos)
})))
</script>

<template>
  <div class="space-y-2">
    <!-- Loading skeleton -->
    <div v-if="loading && filteredTodos.length === 0" class="space-y-2">
      <div
        v-for="i in 4"
        :key="i"
        class="surface-card flex items-center gap-3 rounded-2xl p-4"
      >
        <div class="h-5 w-5 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div class="flex-1 space-y-2">
          <div class="h-3.5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" :style="{ width: `${45 + (i * 13) % 40}%` }" />
          <div class="h-2.5 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <TodoEmpty
      v-else-if="filteredTodos.length === 0"
      :total-count="scopedStats.total"
      :is-filtering="isFiltering"
      :search-query="searchQuery"
      :filter="filter"
      @clear-filters="emit('clearFilters')"
      @create="emit('create')"
    />

    <!-- Grouped list -->
    <template v-else-if="useSections">
      <section
        v-for="section in sections"
        :key="section.name"
        class="space-y-2"
      >
        <header class="flex items-center gap-2 px-1 pt-2">
          <span
            class="flex h-6 w-6 items-center justify-center rounded-lg"
            :class="section.meta.colorClass"
          >
            <UIcon :name="section.meta.icon" class="h-3.5 w-3.5" />
          </span>
          <h3 class="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
            {{ section.name }}
          </h3>
          <span class="todo-meta rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {{ section.rows.length }}
          </span>
          <span class="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-800" />
        </header>

        <TransitionGroup tag="div" name="todo-list" class="space-y-2">
          <TodoItem
            v-for="row in section.rows"
            :key="row.todo.id"
            :todo="row.todo"
            :group-meta="row.meta"
            :is-pending="activeActionId === row.todo.id"
            :is-shared="row.shared"
            :can-edit="row.canEdit"
            :available-groups="availableGroups"
            @toggle="emit('toggle', $event)"
            @update-title="(id, title) => emit('updateTitle', id, title)"
            @update-group="(id, group) => emit('updateGroup', id, group)"
            @open-group="(grp) => emit('openGroup', grp)"
            @open-detail="emit('openDetail', $event)"
            @delete="emit('delete', $event)"
          />
        </TransitionGroup>
      </section>
    </template>

    <!-- Flat list -->
    <TransitionGroup v-else tag="div" name="todo-list" class="space-y-2">
      <TodoItem
        v-for="row in rows"
        :key="row.todo.id"
        :todo="row.todo"
        :group-meta="row.meta"
        :is-pending="activeActionId === row.todo.id"
        :is-shared="row.shared"
        :can-edit="row.canEdit"
        :available-groups="availableGroups"
        @toggle="emit('toggle', $event)"
        @update-title="(id, title) => emit('updateTitle', id, title)"
        @update-group="(id, group) => emit('updateGroup', id, group)"
        @open-group="(grp) => emit('openGroup', grp)"
        @open-detail="emit('openDetail', $event)"
        @delete="emit('delete', $event)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.todo-list-enter-active,
.todo-list-leave-active {
  transition: opacity 0.22s ease-out, transform 0.22s ease-out;
}

.todo-list-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.todo-list-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

.todo-list-move {
  transition: transform 0.22s ease;
}

.todo-list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
