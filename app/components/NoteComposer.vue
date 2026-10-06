<script setup lang="ts">
import { useNotes } from '~/composables/useNotes'
import { useTodos } from '~/composables/useTodos'

/**
 * Note composer: a title plus a free multi-line body.
 *
 * Plain text on purpose — the body is stored as-is and rendered with
 * `whitespace-pre-wrap` in the reading dialog, so whatever is typed is what is shown.
 */
const props = withDefaults(defineProps<{
  groups: string[]
  defaultGroup?: string
  focusSignal?: number
}>(), {
  defaultGroup: 'Generale'
})

const { addNote, isSaving } = useNotes()
const { groupMeta } = useTodos()

const title = ref('')
const body = ref('')
const group = ref(props.defaultGroup || 'Generale')
const titleRef = ref<HTMLInputElement | null>(null)

watch(() => props.defaultGroup, (value) => {
  if (value && value !== 'all') {
    group.value = value
  }
})

watch(() => props.focusSignal, () => {
  titleRef.value?.focus()
})

const activeGroupMeta = computed(() => groupMeta(group.value))
const charCount = computed(() => body.value.trim().length)
const canSubmit = computed(() => title.value.trim().length > 0 && !isSaving.value)

/**
 * `availableGroups` does not know about a group that only holds notes, so the
 * preselected group is appended when missing. Without it the `<select>` would have no
 * option matching the value it holds: the browser would paint one group while the
 * form submitted another.
 */
const groupOptions = computed(() => {
  const list = [...props.groups]
  const current = group.value
  if (current && !list.some(g => g.toLowerCase() === current.toLowerCase())) {
    list.push(current)
  }
  return list
})

async function submit() {
  if (!canSubmit.value) return

  const created = await addNote(title.value, body.value, group.value)
  if (created) {
    title.value = ''
    body.value = ''
    nextTick(() => titleRef.value?.focus())
  }
}
</script>

<template>
  <form
    class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25 dark:border-slate-800 dark:bg-slate-900"
    @submit.prevent="submit"
  >
    <div class="space-y-2">
      <input
        ref="titleRef"
        v-model="title"
        type="text"
        placeholder="Titolo della nota"
        class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base font-semibold text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        aria-label="Titolo della nota"
        :disabled="isSaving"
      >

      <textarea
        v-model="body"
        rows="4"
        placeholder="Scrivi qui la nota…"
        class="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base leading-relaxed text-slate-800 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        aria-label="Testo della nota"
        :disabled="isSaving"
      />
    </div>

    <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <span
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
          :class="activeGroupMeta.colorClass"
        >
          <UIcon :name="activeGroupMeta.icon" class="h-3.5 w-3.5" />
        </span>
        <select
          v-model="group"
          class="max-w-[12rem] rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-base font-medium text-slate-700 focus:border-accent-500 focus:outline-none sm:text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          aria-label="Gruppo della nota"
        >
          <option v-for="name in groupOptions" :key="name" :value="name">{{ name }}</option>
        </select>
        <span v-if="charCount > 0" class="todo-meta text-slate-400 dark:text-slate-500">
          {{ charCount }} caratteri
        </span>
      </div>

      <UButton
        type="submit"
        color="primary"
        size="md"
        :loading="isSaving"
        :disabled="!canSubmit"
        icon="i-lucide-notebook-pen"
        class="rounded-xl font-semibold"
      >
        Salva nota
      </UButton>
    </div>
  </form>
</template>
