<script setup lang="ts">
import { useNotes } from '~/composables/useNotes'
import { useGroups } from '~/composables/useGroups'
import { groupMetaOf } from '~/utils/groups'
import type { GroupNode } from '~/types/group'

/**
 * Note composer: a title, a group and a free multi-line body.
 *
 * Plain text on purpose — the body is stored as-is and rendered with
 * `whitespace-pre-wrap` in the reading dialog, so whatever is typed is what is shown.
 */
const props = withDefaults(defineProps<{
  /** The group tree, as `useGroups().tree` returns it. */
  tree: GroupNode[]
  defaultGroupId?: string | null
  focusSignal?: number
  /** Text to start from — set by the share page, empty everywhere else. */
  initialTitle?: string
}>(), {
  defaultGroupId: null
})

const emit = defineEmits<{
  (e: 'created'): void
}>()

const { addNote, isSaving } = useNotes()
const { flat, createGroup, canAddChild } = useGroups()

const title = ref((props.initialTitle ?? '').trim())
const body = ref('')
const groupId = ref<string | null>(props.defaultGroupId ?? null)
const titleRef = ref<HTMLInputElement | null>(null)
const newGroupName = ref('')

const selected = computed(() => flat.value.find(node => node.group.id === groupId.value) ?? null)
const selectedMeta = computed(() => groupMetaOf(selected.value?.group, 'Generale'))

const activeGroupMeta = computed(() => selectedMeta.value)
const charCount = computed(() => body.value.trim().length)
const canSubmit = computed(() => title.value.trim().length > 0 && !isSaving.value)

const canCreateUnderSelection = computed(() =>
  groupId.value ? canAddChild(groupId.value) : true
)

watch(() => props.defaultGroupId, (value) => {
  if (value) groupId.value = value
})

watch(() => props.focusSignal, () => {
  titleRef.value?.focus()
})

/** A note can open its own sub-group, the same way an activity can. */
async function createSubGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  const parentId = groupId.value && canCreateUnderSelection.value ? groupId.value : null
  const created = await createGroup({ name, parentId })
  if (!created) return
  newGroupName.value = ''
  groupId.value = created.id
}

async function submit() {
  if (!canSubmit.value) return

  const created = await addNote(title.value, body.value, groupId.value)
  if (created) {
    emit('created')
    title.value = ''
    body.value = ''
    nextTick(() => titleRef.value?.focus())
  }
}
</script>

<template>
  <form
    class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25 dark:border-slate-800 dark:bg-slate-900"
    @submit.prevent="submit"
  >
    <div class="space-y-2">
      <input
        ref="titleRef"
        v-model="title"
        type="text"
        placeholder="Titolo della nota"
        class="w-full rounded-xl border-0 bg-transparent px-1 py-1.5 text-base font-semibold text-slate-900 placeholder-slate-400 focus:ring-0 focus:outline-none dark:text-white"
        aria-label="Titolo della nota"
      >
      <textarea
        v-model="body"
        rows="3"
        placeholder="Testo della nota…"
        class="w-full resize-y rounded-xl border-0 bg-transparent px-1 py-1.5 text-sm leading-relaxed text-slate-700 placeholder-slate-400 focus:ring-0 focus:outline-none dark:text-slate-200"
        aria-label="Testo della nota"
      />
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
      <GroupSelect
        v-model="groupId"
        :tree="tree"
        aria-label="Gruppo della nota"
        class="max-w-[14rem]"
      />

      <div class="flex items-center gap-1.5">
        <input
          v-model="newGroupName"
          type="text"
          :placeholder="groupId && canCreateUnderSelection ? `Nuovo dentro «${selected?.group.name}»` : 'Nuovo gruppo'"
          class="w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          aria-label="Nome del nuovo gruppo"
          @keydown.enter.prevent="createSubGroup"
        >
        <button
          type="button"
          class="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          :disabled="!newGroupName.trim()"
          :title="`Il gruppo attivo è «${selectedMeta.name}»`"
          @click="createSubGroup"
        >
          <UIcon :name="activeGroupMeta.icon" class="h-3.5 w-3.5" />
        </button>
      </div>

      <span class="todo-meta text-slate-400 dark:text-slate-500">{{ charCount }} caratteri</span>

      <button
        type="submit"
        class="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-accent-700 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!canSubmit"
      >
        <UIcon
          :name="isSaving ? 'i-lucide-loader-circle' : 'i-lucide-save'"
          class="h-3.5 w-3.5"
          :class="isSaving ? 'animate-spin' : ''"
        />
        <span>Salva nota</span>
      </button>
    </div>
  </form>
</template>
