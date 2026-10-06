<script setup lang="ts">
import type { NoteWithGroup } from '~/types/note'
import type { GroupNode } from '~/types/group'
import { formatFullDate } from '~/utils/date'
import { groupMetaOf } from '~/utils/groups'
import { useShares } from '~/composables/useShares'
import { useCurrentUser } from '~/composables/useCurrentUser'
import { useWebShare } from '~/composables/useWebShare'

/**
 * Reading and editing view for a single note — the note counterpart of
 * `TodoDetailModal`, with the same read/edit split and read-only handling.
 */
const props = defineProps<{
  open: boolean
  note: NoteWithGroup | null
  /** The group tree, for the group picker. */
  tree: GroupNode[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', payload: { id: number, title: string, body: string, groupId: string | null }): void
  (e: 'delete', id: number): void
  (e: 'open-group', groupId: string): void
}>()

const { userId } = useCurrentUser()
const { permissionFor } = useShares()
const { canShare, share } = useWebShare()

const isEditing = ref(false)
const draftTitle = ref('')
const draftBody = ref('')
const draftGroupId = ref<string | null>(null)
const copied = ref(false)
const titleRef = ref<HTMLInputElement | null>(null)

const title = computed(() => props.note?.title ?? '')
const body = computed(() => props.note?.body ?? '')
const meta = computed(() => groupMetaOf(props.note?.group, props.note?.group_name))
const groupName = computed(() => meta.value.name)

const hasBody = computed(() => body.value.trim().length > 0)
const canEdit = computed(() => (props.note ? permissionFor(props.note) !== 'read' : true))
const isShared = computed(() => Boolean(props.note?.user_id && props.note.user_id !== userId.value))

function startEditing() {
  if (!props.note || !canEdit.value) return

  draftTitle.value = props.note.title
  draftBody.value = props.note.body
  draftGroupId.value = props.note.group_id ?? null
  isEditing.value = true

  nextTick(() => {
    titleRef.value?.focus()
    titleRef.value?.setSelectionRange(draftTitle.value.length, draftTitle.value.length)
  })
}

function cancelEditing() {
  isEditing.value = false
}

function save() {
  if (!props.note) return
  const trimmed = draftTitle.value.trim()
  if (!trimmed) return

  emit('save', {
    id: props.note.id,
    title: trimmed,
    body: draftBody.value,
    groupId: draftGroupId.value
  })
  isEditing.value = false
}

async function copyText() {
  if (!props.note || !import.meta.client) return

  const text = [props.note.title, props.note.body].filter(Boolean).join('\n\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch (error) {
    console.error('Clipboard unavailable:', error)
  }
}

/** Hand the note to another app — the phone's share sheet, or the clipboard. */
async function shareNote() {
  if (!props.note) return
  await share({ title: props.note.title, text: props.note.body })
}

watch(() => props.open, (open) => {
  if (!open) {
    isEditing.value = false
    copied.value = false
  }
})
</script>

<template>
  <AppModal
    :open="open"
    size="lg"
    full-height
    icon="i-lucide-notebook-pen"
    :title="isEditing ? 'Modifica nota' : 'Dettaglio nota'"
    :subtitle="note ? formatFullDate(note.created_at) : undefined"
    @update:open="(value) => emit('update:open', value)"
  >
    <div v-if="note" class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
          :class="meta.colorClass"
          :title="`Vedi il gruppo ${groupName}`"
          @click="note.group_id && emit('open-group', note.group_id); emit('update:open', false)"
        >
          <UIcon :name="meta.icon" class="h-3.5 w-3.5" />
          <span>{{ groupName }}</span>
        </button>

        <span
          v-if="isShared"
          class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
        >
          <UIcon name="i-lucide-users" class="h-3.5 w-3.5" />
          <span>Condivisa con te</span>
        </span>

        <span
          v-if="!canEdit"
          class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          <UIcon name="i-lucide-lock" class="h-3.5 w-3.5" />
          <span>Sola lettura</span>
        </span>
      </div>

      <template v-if="!isEditing">
        <h3 class="reading-text-lg font-semibold text-slate-900 select-text dark:text-white">
          {{ note.title }}
        </h3>
        <p
          v-if="hasBody"
          class="reading-text whitespace-pre-wrap break-words text-slate-700 select-text dark:text-slate-200"
        >
          {{ note.body }}
        </p>
        <p v-else class="todo-meta text-slate-400 dark:text-slate-500">
          Questa nota non ha testo.
        </p>
      </template>

      <template v-else>
        <div class="space-y-2">
          <input
            ref="titleRef"
            v-model="draftTitle"
            type="text"
            class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base font-semibold text-slate-900 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            aria-label="Titolo della nota"
          >
          <textarea
            v-model="draftBody"
            rows="8"
            class="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Testo della nota"
          />
          <div class="space-y-1.5">
            <label class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
              Gruppo
            </label>
            <GroupSelect
              v-model="draftGroupId"
              :tree="tree"
              :disabled="!canEdit"
              aria-label="Gruppo della nota"
            />
          </div>
        </div>
      </template>

      <dl class="grid grid-cols-2 gap-3 text-xs">
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Creata</dt>
          <dd class="mt-0.5 text-slate-700 dark:text-slate-200">{{ formatFullDate(note.created_at) || '—' }}</dd>
        </div>
        <div class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <dt class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">Aggiornata</dt>
          <dd class="mt-0.5 text-slate-700 dark:text-slate-200">{{ formatFullDate(note.updated_at) || '—' }}</dd>
        </div>
      </dl>
    </div>

    <p v-else class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
      Nessuna nota selezionata.
    </p>

    <template #footer>
      <template v-if="note">
        <div class="ml-auto flex items-center gap-2">
          <template v-if="isEditing">
            <UButton color="neutral" variant="ghost" size="md" class="rounded-xl" @click="cancelEditing">
              Annulla
            </UButton>
            <UButton
              color="primary"
              size="md"
              icon="i-lucide-save"
              class="rounded-xl font-semibold"
              :disabled="!draftTitle.trim()"
              @click="save"
            >
              Salva
            </UButton>
          </template>
          <template v-else>
            <UButton
              v-if="canEdit"
              color="neutral"
              variant="soft"
              size="md"
              icon="i-lucide-pencil"
              class="rounded-xl"
              @click="startEditing"
            >
              Modifica
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              size="md"
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              class="rounded-xl"
              aria-label="Copia il testo della nota"
              @click="copyText"
            />
            <UButton
              v-if="canShare"
              color="neutral"
              variant="soft"
              size="md"
              icon="i-lucide-share-2"
              class="rounded-xl"
              aria-label="Condividi la nota"
              @click="shareNote"
            />
            <UButton
              v-if="canEdit"
              color="error"
              variant="soft"
              size="md"
              icon="i-lucide-trash-2"
              class="rounded-xl"
              aria-label="Elimina nota"
              @click="emit('delete', note.id)"
            />
          </template>
        </div>
      </template>
    </template>
  </AppModal>
</template>
