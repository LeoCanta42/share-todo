<script setup lang="ts">
import { useShares } from '~/composables/useShares'
import { useGroups } from '~/composables/useGroups'
import { groupMetaOf } from '~/utils/groups'

/**
 * Sharing, by group.
 *
 * A grant names a group and covers its sub-groups, so the picker offers the tree and
 * says so in words — "il gruppo «Lavoro» e i suoi sottogruppi" — because "share this
 * group" meaning "and everything under it" is exactly the kind of thing that has to
 * be visible before the button is pressed.
 */
const props = withDefaults(defineProps<{
  open: boolean
  /** Pre-select this group (the group page hands its own id). */
  initialGroup?: string | null
}>(), {
  initialGroup: null
})

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { tree, groupsById, loadGroups } = useGroups()
const {
  myShares,
  receivedShares,
  loading,
  isSharing,
  loadShares,
  shareList,
  updateSharePermission,
  removeShare,
  describeScope
} = useShares()

const email = ref('')
const permission = ref<'read' | 'edit'>('edit')
const groupId = ref<string | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  groupId.value = props.initialGroup ?? null
  email.value = ''
  permission.value = 'edit'
  if (groupsById.value.size === 0) await loadGroups()
  await loadShares()
}, { immediate: true })

watch(() => props.initialGroup, (value) => {
  if (props.open) groupId.value = value ?? null
})

const selectedMeta = computed(() => groupMetaOf(groupId.value ? groupsById.value.get(groupId.value) : null, 'Generale'))

const canSubmit = computed(() => email.value.trim().includes('@') && !isSharing.value)

async function submit() {
  if (!canSubmit.value) return
  const done = await shareList(email.value, permission.value, groupId.value)
  if (done) email.value = ''
}

/** Who shared what with me — read-only list, so it is clear where access comes from. */
const received = computed(() => receivedShares.value.filter(share => share.owner_id))
</script>

<template>
  <AppModal
    :open="open"
    size="lg"
    icon="i-lucide-share-2"
    title="Condividi"
    subtitle="Chi riceve un gruppo vede anche i suoi sottogruppi."
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-5">
      <!-- What to share -->
      <section class="space-y-2">
        <label class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
          Cosa condividere
        </label>
        <GroupSelect
          v-model="groupId"
          :tree="tree"
          allow-whole-list
          whole-list-label="Tutta la lista"
          aria-label="Gruppo da condividere"
        />
        <p class="todo-meta flex items-start gap-1.5 text-slate-500 dark:text-slate-400">
          <UIcon :name="selectedMeta.icon" class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>Stai condividendo {{ describeScope(groupId) }}.</span>
        </p>
      </section>

      <!-- Invite -->
      <section class="space-y-2">
        <label class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
          Invita una persona
        </label>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            v-model="email"
            type="email"
            placeholder="nome@esempio.com"
            class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Email della persona da invitare"
            @keydown.enter.prevent="submit"
          >
          <SegmentedControl
            v-model="permission"
            :options="[{ id: 'edit', label: 'Può modificare' }, { id: 'read', label: 'Solo lettura' }]"
            aria-label="Permesso"
          />
          <UButton
            color="primary"
            size="md"
            icon="i-lucide-send"
            class="rounded-xl font-semibold"
            :disabled="!canSubmit"
            :loading="isSharing"
            @click="submit"
          >
            Invita
          </UButton>
        </div>
      </section>

      <!-- Grants I handed out -->
      <section class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Persone con accesso
          </h3>
          <span class="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
          <span class="todo-meta text-slate-400 dark:text-slate-500">{{ myShares.length }}</span>
        </div>

        <p v-if="loading && myShares.length === 0" class="todo-meta text-slate-400">
          Caricamento…
        </p>
        <p v-else-if="myShares.length === 0" class="todo-meta text-slate-400 dark:text-slate-500">
          Non hai ancora condiviso nulla: le tue attività sono solo tue.
        </p>

        <ul v-else class="space-y-1.5">
          <li
            v-for="share in myShares"
            :key="share.id"
            class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                {{ share.shared_with_email }}
              </p>
              <p class="todo-meta text-slate-400 dark:text-slate-500">
                {{ describeScope(share.group_id) }}
              </p>
            </div>

            <SegmentedControl
              :model-value="share.permission"
              :options="[{ id: 'edit', label: 'Modifica' }, { id: 'read', label: 'Lettura' }]"
              :aria-label="`Permesso per ${share.shared_with_email}`"
              @update:model-value="(value) => updateSharePermission(share.id, value as 'read' | 'edit')"
            />

            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:outline-none dark:hover:bg-red-950/40 dark:hover:text-red-400"
              :aria-label="`Revoca l'accesso a ${share.shared_with_email}`"
              title="Revoca"
              @click="removeShare(share.id)"
            >
              <UIcon name="i-lucide-user-minus" class="h-4 w-4" />
            </button>
          </li>
        </ul>
      </section>

      <!-- What was shared with me -->
      <section v-if="received.length" class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="todo-meta font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Condiviso con te
          </h3>
          <span class="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
        </div>
        <ul class="space-y-1">
          <li
            v-for="share in received"
            :key="share.id"
            class="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50"
          >
            <UIcon name="i-lucide-users" class="h-3.5 w-3.5 flex-shrink-0 text-sky-500" />
            <span class="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-slate-300">
              {{ describeScope(share.group_id) }}
            </span>
            <span class="todo-meta rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {{ share.permission === 'edit' ? 'Modifica' : 'Lettura' }}
            </span>
          </li>
        </ul>
      </section>
    </div>
  </AppModal>
</template>
