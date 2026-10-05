<script setup lang="ts">
import type { Todo } from '~/types/todo'
import { formatDate } from '~/utils/date'
import { getGroupMeta } from '~/utils/groups'

const props = defineProps<{
  todo: Todo
  isPending?: boolean
  isShared?: boolean
  availableGroups?: string[]
}>()

const emit = defineEmits<{
  (e: 'toggle', todo: Todo): void
  (e: 'updateTitle', id: number, newTitle: string): void
  (e: 'updateGroup', id: number, newGroup: string): void
  (e: 'filterGroup', group: string): void
  (e: 'delete', id: number): void
}>()

const isEditing = ref(false)
const editTitle = ref('')
const editGroup = ref('Generale')
const editInputRef = ref<HTMLInputElement | null>(null)

const groupMeta = computed(() => getGroupMeta(props.todo.group_name))

function startEditing() {
  editTitle.value = props.todo.title
  editGroup.value = props.todo.group_name || 'Generale'
  isEditing.value = true
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function saveEdit() {
  if (!isEditing.value) return
  const trimmed = editTitle.value.trim()
  if (trimmed && trimmed !== props.todo.title) {
    emit('updateTitle', props.todo.id, trimmed)
  }
  if (editGroup.value && editGroup.value !== (props.todo.group_name || 'Generale')) {
    emit('updateGroup', props.todo.id, editGroup.value)
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
  editTitle.value = props.todo.title
  editGroup.value = props.todo.group_name || 'Generale'
}
</script>

<template>
  <div
    class="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-xl border transition-all duration-200"
    :class="[
      todo.completed
        ? 'bg-gray-50/70 dark:bg-gray-900/40 border-gray-200/60 dark:border-gray-800/60 opacity-80'
        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-xs hover:shadow-md hover:border-emerald-500/30 dark:hover:border-emerald-500/30'
    ]"
  >
    <!-- Left side: Checkbox & task details -->
    <div class="flex items-start sm:items-center gap-3.5 flex-1 min-w-0 pr-3">
      <!-- Custom Animated Checkbox -->
      <button
        type="button"
        role="checkbox"
        :aria-checked="Boolean(todo.completed)"
        class="w-5 h-5 rounded-lg border flex items-center justify-center transition-all duration-150 flex-shrink-0 mt-0.5 sm:mt-0 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        :class="[
          todo.completed
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-gray-300 dark:border-gray-600 hover:border-emerald-500 dark:hover:border-emerald-400 bg-white dark:bg-gray-800'
        ]"
        :disabled="isPending"
        @click="emit('toggle', todo)"
      >
        <UIcon
          name="i-lucide-check"
          class="w-3.5 h-3.5 transition-transform transform"
          :class="todo.completed ? 'scale-100' : 'scale-0'"
        />
      </button>

      <!-- Content display / Inline edit -->
      <div class="flex-1 min-w-0">
        <!-- Edit Form -->
        <form v-if="isEditing" @submit.prevent="saveEdit" class="space-y-2 w-full">
          <input
            ref="editInputRef"
            v-model="editTitle"
            type="text"
            class="w-full px-2.5 py-1 text-sm bg-white dark:bg-gray-800 border border-emerald-500 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            @keydown.esc="cancelEdit"
          >
          <div class="flex items-center gap-2">
            <select
              v-if="availableGroups && availableGroups.length > 0"
              v-model="editGroup"
              class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md text-gray-800 dark:text-gray-200"
            >
              <option v-for="g in availableGroups" :key="g" :value="g">
                {{ g }}
              </option>
            </select>
            <button
              type="submit"
              class="px-2.5 py-0.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
            >
              Salva
            </button>
            <button
              type="button"
              class="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="cancelEdit"
            >
              Annulla
            </button>
          </div>
        </form>

        <!-- Normal View -->
        <div v-else class="flex flex-col gap-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span
              class="text-sm font-medium transition-all select-none cursor-pointer"
              :class="[
                todo.completed
                  ? 'line-through text-gray-400 dark:text-gray-500'
                  : 'text-gray-800 dark:text-gray-100 hover:text-emerald-600 dark:hover:text-emerald-400'
              ]"
              @dblclick="startEditing"
              @click="emit('toggle', todo)"
            >
              {{ todo.title }}
            </span>

            <!-- Shared badge -->
            <span
              v-if="isShared"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
              title="Attività condivisa con te da un altro utente"
            >
              <UIcon name="i-lucide-users" class="w-3 h-3" />
              <span>Condivisa</span>
            </span>

            <!-- Subgroup Badge -->
            <button
              type="button"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-opacity hover:opacity-80"
              :class="groupMeta.colorClass"
              :title="`Filtra per gruppo: ${groupMeta.name}`"
              @click.stop="emit('filterGroup', groupMeta.name)"
            >
              <UIcon :name="groupMeta.icon" class="w-3 h-3" />
              <span>{{ groupMeta.name }}</span>
            </button>
          </div>

          <!-- Timestamp badge -->
          <div v-if="todo.created_at" class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 select-none">
            <UIcon name="i-lucide-clock" class="w-3 h-3" />
            <span>{{ formatDate(todo.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right side: Actions -->
    <div class="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      <UButton
        variant="ghost"
        color="neutral"
        size="xs"
        icon="i-lucide-pencil"
        :aria-label="`Modifica ${todo.title}`"
        class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        @click="startEditing"
      />
      <UButton
        variant="ghost"
        color="neutral"
        size="xs"
        icon="i-lucide-trash-2"
        :aria-label="`Elimina ${todo.title}`"
        class="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
        :loading="isPending"
        @click="emit('delete', todo.id)"
      />
    </div>
  </div>
</template>
