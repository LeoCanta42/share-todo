<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'
import { useGroups } from '~/composables/useGroups'
import { usePreferences } from '~/composables/usePreferences'
import { useShares } from '~/composables/useShares'
import { groupMetaOf } from '~/utils/groups'
import { haptic } from '~/utils/haptics'
import type { GroupMeta } from '~/utils/groups'
import type { GroupNode } from '~/types/group'
import type { TodoWithGroup } from '~/types/todo'

interface Row {
  todo: TodoWithGroup
  meta: GroupMeta
  shared: boolean
  canEdit: boolean
}

/**
 * The list itself. Reads the shared todo state directly (it is `useState`-backed)
 * and only forwards user intent upwards, where the confirmation rules live.
 */
const emit = defineEmits<{
  (e: 'toggle', todo: TodoWithGroup): void
  (e: 'toggleAll', todos: TodoWithGroup[]): void
  (e: 'delete', id: number): void
  (e: 'openDetail', todo: TodoWithGroup, startInEdit?: boolean): void
  (e: 'openGroup', groupId: string): void
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
  scopedStats,
  isShared
} = useTodos()

const { tree } = useGroups()
const { prefs } = usePreferences()
const { permissionFor } = useShares()

const useSections = computed(() => prefs.value.sort === 'group' && prefs.value.groupSections)

/**
 * The group is deliberately not part of this: on `/g/…` the scope comes from the
 * route, so treating it as a "filter" would offer an "Azzera i filtri" button
 * that empties the page it is on.
 */
const isFiltering = computed(() =>
  filter.value !== 'all' || scope.value !== 'all' || searchQuery.value.trim() !== ''
)

/**
 * Row view-models are built once per data change rather than derived inside the
 * template: the badge look is memoised per group, and the permission flags are plain
 * booleans, so rows whose data did not change receive identical props and Vue skips
 * re-rendering them.
 */
function toRows(todos: TodoWithGroup[]): Row[] {
  return todos.map(todo => ({
    todo,
    // The group row carries the colour and the icon; a row whose group is no longer
    // readable keeps the name it mirrored.
    meta: groupMetaOf(todo.group, todo.group_name),
    shared: isShared(todo),
    canEdit: permissionFor(todo) !== 'read'
  }))
}

const rows = computed<Row[]>(() => toRows(filteredTodos.value))

const sections = computed(() => groupedTodos.value.map(section => ({
  id: section.groupId || 'none',
  name: section.name,
  rows: toRows(section.todos)
})))

function handleToggleSection(todosToToggle: TodoWithGroup[]) {
  haptic(12)
  emit('toggleAll', todosToToggle)
}
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
        :key="section.id"
        class="space-y-2"
      >
        <header class="flex items-center gap-2 px-1 pt-2">
          <span
            class="flex h-6 w-6 items-center justify-center rounded-lg"
            :class="groupMetaOf(section.rows[0]?.todo.group, section.name).colorClass"
          >
            <UIcon :name="groupMetaOf(section.rows[0]?.todo.group, section.name).icon" class="h-3.5 w-3.5" />
          </span>
          <h3 class="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
            {{ section.name }}
          </h3>
          <span class="todo-meta rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {{ section.rows.length }}
          </span>
          <span class="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-800" />

          <button
            v-if="section.rows.some(r => r.canEdit)"
            type="button"
            class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
            :class="section.rows.every(r => r.todo.completed)
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              : 'bg-accent-50 text-accent-700 hover:bg-accent-100 dark:bg-accent-950/60 dark:text-accent-300 dark:hover:bg-accent-900/80'"
            :title="section.rows.every(r => r.todo.completed)
              ? `Deseleziona tutte le attività in ${section.name}`
              : `Seleziona tutte le attività in ${section.name}`"
            :aria-label="section.rows.every(r => r.todo.completed)
              ? `Deseleziona tutte in ${section.name}`
              : `Seleziona tutte in ${section.name}`"
            @click="handleToggleSection(section.rows.map(r => r.todo))"
          >
            <UIcon
              :name="section.rows.every(r => r.todo.completed) ? 'i-lucide-check-check' : 'i-lucide-check'"
              class="h-3.5 w-3.5"
            />
            <span class="todo-meta">{{ section.rows.every(r => r.todo.completed) ? 'Deseleziona tutti' : 'Seleziona tutti' }}</span>
          </button>
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
            @toggle="emit('toggle', $event)"
            @open-group="(groupId) => emit('openGroup', groupId)"
            @open-detail="(todo, startInEdit) => emit('openDetail', todo, startInEdit)"
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
        @toggle="emit('toggle', $event)"
        @open-group="(groupId) => emit('openGroup', groupId)"
        @open-detail="(todo, startInEdit) => emit('openDetail', todo, startInEdit)"
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
