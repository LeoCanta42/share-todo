<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'
import { useGroups } from '~/composables/useGroups'
import { useConfirm } from '~/composables/useConfirm'
import { usePreferences } from '~/composables/usePreferences'
import { useQuickAdd } from '~/composables/useQuickAdd'
import type { TodoWithGroup } from '~/types/todo'

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
  selectedGroupId,
  groupNameOf,
  toggleTodo,
  updateTodoTitle,
  updateTodoGroup,
  updateTodoDueDate,
  deleteTodo,
  clearCompleted,
  filter,
  scope,
  searchQuery
} = useTodos()

const { tree, namePath } = useGroups()
const { ask } = useConfirm()
const { prefs } = usePreferences()
const { focusSignal, focusQuickAdd } = useQuickAdd()
const route = useRoute()

const isDetailOpen = ref(false)
const detailId = ref<number | null>(null)

/** Derived so the open dialog always shows the latest version of the activity. */
const detailTodo = computed<TodoWithGroup | null>(
  () => todos.value.find(todo => todo.id === detailId.value) ?? null
)

// Deep linking: `/?todo=123` opens detail dialog for that activity
function checkDeepLink() {
  const queryParam = route.query.todo
  if (!queryParam) return
  const targetId = Number(queryParam)
  if (!Number.isNaN(targetId) && targetId > 0) {
    const target = todos.value.find(t => t.id === targetId)
    if (target) {
      detailId.value = target.id
      isDetailOpen.value = true
    }
  }
}

watch(() => route.query.todo, () => checkDeepLink(), { immediate: true })
watch(todos, () => {
  if (route.query.todo && !isDetailOpen.value) {
    checkDeepLink()
  }
})

/**
 * Where a new activity goes when nothing else is chosen: the group being viewed,
 * or "Generale" — the bucket every account has.
 */
const defaultGroupId = computed<string | null>(() => {
  if (selectedGroupId.value !== 'all') return selectedGroupId.value
  const root = tree.value.find(node => node.group.parent_id === null
    && node.group.name.trim().toLowerCase() === 'generale')
  return root?.group.id ?? null
})

function openDetail(todo: TodoWithGroup) {
  detailId.value = todo.id
  isDetailOpen.value = true
}

/** A group chip walks *into* that group's page, at any depth. */
function openGroup(groupId: string) {
  navigateTo({ name: 'g-group', params: { group: namePath(groupId) } })
}

function shorten(text: string, max = 140): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 1)}…` : single
}

async function handleDelete(id: number) {
  const todo = todos.value.find(item => item.id === id)

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

function handleDetailSave(payload: {
  id: number
  title: string
  groupId: string | null
  dueAt: string | null
  dueAllDay: boolean
}) {
  const todo = todos.value.find(item => item.id === payload.id)
  if (!todo) return

  if (payload.title !== todo.title) {
    updateTodoTitle(payload.id, payload.title)
  }
  if ((payload.groupId ?? null) !== (todo.group_id ?? null)) {
    updateTodoGroup(payload.id, payload.groupId)
  }
  if (payload.dueAt !== todo.due_at || payload.dueAllDay !== Boolean(todo.due_all_day)) {
    updateTodoDueDate(payload.id, {
      dueAt: payload.dueAt,
      dueAllDay: payload.dueAllDay
    })
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
</script>

<template>
  <div class="space-y-4 sm:space-y-5">
    <section aria-label="Aggiungi attività o nota">
      <QuickAdd
        :tree="tree"
        :default-group-id="defaultGroupId"
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
      :tree="tree"
      @toggle="toggleTodo"
      @save="handleDetailSave"
      @delete="handleDelete"
      @open-group="openGroup"
    />
  </div>
</template>
