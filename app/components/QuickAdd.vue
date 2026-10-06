<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'

/**
 * The entry point for creating content: a switch between an activity and a note,
 * over the matching composer.
 *
 * The two are separate forms on purpose — a note has a body, an activity does not —
 * and this keeps the choice in one obvious place instead of hiding notes behind a
 * different page.
 */
const props = withDefaults(defineProps<{
  groups: string[]
  defaultGroup?: string
  focusSignal?: number
  /** Which composer to open with. */
  defaultMode?: 'todo' | 'note'
  /** Text the composer starts from (the share page hands it the shared content). */
  initialTitle?: string
}>(), {
  defaultMode: 'todo'
})

const emit = defineEmits<{
  (e: 'created'): void
}>()

const { addTodo, isAdding } = useTodos()

type Mode = 'todo' | 'note'

const mode = ref<Mode>(props.defaultMode)

const modeOptions = [
  { id: 'todo', label: 'Attività', icon: 'i-lucide-list-checks' },
  { id: 'note', label: 'Nota', icon: 'i-lucide-notebook-pen' }
]

async function handleAddTodo(title: string, group: string) {
  const created = await addTodo(title, group)
  if (created) {
    emit('created')
  }
}
</script>

<template>
  <div class="space-y-2">
    <SegmentedControl
      v-model="mode"
      :options="modeOptions"
      aria-label="Cosa vuoi creare"
      size="sm"
    />

    <TodoInput
      v-if="mode === 'todo'"
      :loading="isAdding"
      :available-groups="groups"
      :default-group="defaultGroup"
      :focus-signal="focusSignal"
      :initial-title="initialTitle"
      @add="handleAddTodo"
    />

    <NoteComposer
      v-else
      :groups="groups"
      :default-group="defaultGroup"
      :focus-signal="focusSignal"
      :initial-title="initialTitle"
      @created="emit('created')"
    />
  </div>
</template>
