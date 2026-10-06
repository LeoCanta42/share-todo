<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'
import { useShares } from '~/composables/useShares'
import { useConfirm } from '~/composables/useConfirm'
import { usePreferences } from '~/composables/usePreferences'
import { useQuickAdd } from '~/composables/useQuickAdd'
import type { Todo } from '~/types/todo'

/**
 * The activity machinery shared by the overview and a group page: quick add,
 * filters, list and the reading dialog — including every confirmation rule.
 *
 * One component rather than a copy per page, because the destructive paths
 * (delete, clear completed, read-only refusals) are exactly the ones that must not
 * drift apart between two pages.
 */
const {
  todos,
  scopedStats,
  selectedGroup,
  availableGroups,
  groupMeta,
  isShared,
  toggleTodo,
  updateTodoTitle,
  updateTodoGroup,
  deleteTodo,
  clearCompleted,
  filter,
  scope,
  searchQuery
} = useTodos()

const { permissionFor } = useShares()
const { ask } = useConfirm()
const { prefs } = usePreferences()
const { focusSignal, focusQuickAdd } = useQuickAdd()

const isDetailOpen = ref(false)
const detailId = ref<number | null>(null)

/** Derived so the open dialog always shows the latest version of the activity. */
const detailTodo = computed<Todo | null>(
  () => todos.value.find(t => t.id === detailId.value) ?? null
)

const detailMeta = computed(() => groupMeta(detailTodo.value?.group_name))
const detailEditable = computed(() => (detailTodo.value ? permissionFor(detailTodo.value) !== 'read' : true))

function openDetail(todo: Todo) {
  detailId.value = todo.id
  isDetailOpen.value = true
}

/** A group chip now opens that group's page instead of filtering in place. */
function openGroup(name: string) {
  navigateTo({ name: 'g-group', params: { group: name } })
}

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
  const count = scopedStats.value.completed
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

/**
 * Resets the status/origin/search filters but deliberately NOT the group: on a group
 * page that value comes from the route, and clearing it would empty the page.
 */
function clearFilters() {
  filter.value = 'all'
  scope.value = 'all'
  searchQuery.value = ''
}

const addDefaultGroup = computed(() => (selectedGroup.value !== 'all' ? selectedGroup.value : 'Generale'))
</script>

<template>
  <div class="space-y-4 sm:space-y-5">
    <section aria-label="Aggiungi attività o nota">
      <QuickAdd
        :groups="availableGroups"
        :default-group="addDefaultGroup"
        :focus-signal="focusSignal"
      />
    </section>

    <section v-if="scopedStats.total > 0" aria-label="Filtri e ricerca">
      <TodoFilters @clear-completed="handleClearCompleted" />
    </section>

    <section aria-label="Elenco attività">
      <TodoList
        @toggle="toggleTodo"
        @update-title="updateTodoTitle"
        @update-group="updateTodoGroup"
        @open-group="openGroup"
        @open-detail="openDetail"
        @delete="handleDelete"
        @clear-filters="clearFilters"
        @create="focusQuickAdd"
      />
    </section>

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
      @open-group="openGroup"
    />
  </div>
</template>
