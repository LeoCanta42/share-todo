<script setup lang="ts">
import type { Note } from '~/types/note'
import { formatFullDate } from '~/utils/date'

/**
 * Reading and editing view for a single note — the note counterpart of
 * `TodoDetailModal`, with the same read/edit split and read-only handling.
 */
const props = defineProps<{
  open: boolean
  note: Note | null
  groups: string[]
  isShared?: boolean
  groupIcon?: string
  groupColorClass?: string
  canEdit?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', payload: { id: number, title: string, body: string, group: string }): void
  (e: 'delete', id: number): void
  (e: 'open-group', name: string): void
}>()

const isEditing = ref(false)
const draftTitle = ref('')
const draftBody = ref('')
const draftGroup = ref('Generale')
const copied = ref(false)
const titleRef = ref<HTMLInputElement | null>(null)

const title = computed(() => props.note?.title ?? '')
const body = computed(() => props.note?.body ?? '')
const groupName = computed(() => (props.note?.group_name || 'Generale').trim() || 'Generale')

const hasBody = computed(() => body.value.trim().length > 0)

/**
 * The note's own group may not be in `groups` (a group that only holds notes is not
 * part of `availableGroups`), so it is appended: a `<select>` with no matching option
 * would show one group while saving another.
 */
const groupOptions = computed(() => {
  const list = [...props.groups]
  const current = draftGroup.value
  if (current && !list.some(g => g.toLowerCase() === current.toLowerCase())) {
    list.push(current)
  }
  return list
})

function startEditing() {
  if (!props.note || !props.canEdit) return

  draftTitle.value = props.note.title
  draftBody.value = props.note.body
  draftGroup.value = groupName.value
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
    group: draftGroup.value
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
    :title="isEditing ? 'Modifica nota' : 'Nota'"
    :subtitle="note ? formatFullDate(note.updated_at ?? note.created_at) : undefined"
    @update:open="(value) => emit('update:open', value)"
  >
    <div v-if="note" class="space-y-4">
      <!-- Meta line -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
          :class="groupColorClass"
          :title="`Apri il gruppo ${groupName}`"
          @click="emit('open-group', groupName); emit('update:open', false)"
        >
          <UIcon :name="groupIcon || 'i-lucide-folder'" class="h-3.5 w-3.5" />
          <span>{{ groupName }}</span>
        </button>

        <span
          v-if="isShared"
          class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
        >
          <UIcon name="i-lucide-users" class="h-3.5 w-3.5" />
          <span>Condivisa con te</span>
        </span>

        <span
          v-if="!canEdit"
          class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          <UIcon name="i-lucide-lock" class="h-3.5 w-3.5" />
          <span>Sola lettura</span>
        </span>
      </div>

      <template v-if="isEditing">
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Titolo
          </label>
          <input
            ref="titleRef"
            v-model="draftTitle"
            type="text"
            class="w-full rounded-xl border border-accent-500 bg-white px-3 py-2.5 font-semibold text-slate-900 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:bg-slate-900 dark:text-white"
            aria-label="Titolo della nota"
          >
        </div>

        <div class="space-y-2">
          <label class="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Testo
          </label>
          <textarea
            v-model="draftBody"
            rows="10"
            class="reading-text w-full resize-y rounded-xl border border-accent-500 bg-white px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:bg-slate-900 dark:text-white"
            aria-label="Testo della nota"
          />
        </div>

        <div class="space-y-2">
          <label class="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Gruppo
          </label>
          <select
            v-model="draftGroup"
            class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
      </template>

      <template v-else>
        <h3 class="todo-title text-lg font-bold break-words text-slate-900 select-text dark:text-white">
          {{ title }}
        </h3>

        <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40">
          <p
            v-if="hasBody"
            class="reading-text whitespace-pre-wrap break-words text-slate-800 select-text dark:text-slate-100"
          >{{ body }}</p>
          <p v-else class="text-sm text-slate-400 italic dark:text-slate-500">
            Questa nota non ha ancora un testo.
          </p>
        </div>

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
      </template>
    </div>

    <p v-else class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
      Nessuna nota selezionata.
    </p>

    <template #footer>
      <template v-if="note">
        <div class="ml-auto flex items-center gap-2">
          <template v-if="isEditing">
            <UButton
              color="neutral"
              variant="ghost"
              size="md"
              class="rounded-xl"
              @click="cancelEditing"
            >
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
