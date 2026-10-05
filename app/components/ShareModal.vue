<script setup lang="ts">
import { useShares } from '~/composables/useShares'
import { useConfirm } from '~/composables/useConfirm'
import { formatShortDate } from '~/utils/date'

/**
 * Sharing panel.
 *
 * Rebuilt on AppModal, and now also lists the lists *shared with you* — the
 * composable already fetched them, but nothing ever displayed them.
 */
defineProps<{ open: boolean }>()

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { myShares, receivedShares, isSharing, shareList, removeShare } = useShares()
const { availableGroups, groupMeta } = useTodos()
const { ask } = useConfirm()

/** Sentinel for the <select>: the database stores "whole list" as NULL. */
const ALL_GROUPS = '__all__'

const inviteEmail = ref('')
const invitePermission = ref<'edit' | 'read'>('edit')
const inviteGroup = ref<string>(ALL_GROUPS)

const permissionOptions = [
  { id: 'edit', label: 'Puo modificare', icon: 'i-lucide-pencil' },
  { id: 'read', label: 'Sola lettura', icon: 'i-lucide-eye' }
]

async function handleShare() {
  const trimmed = inviteEmail.value.trim()
  if (!trimmed || isSharing.value) return

  const success = await shareList(
    trimmed,
    invitePermission.value,
    inviteGroup.value === ALL_GROUPS ? null : inviteGroup.value
  )
  if (success) inviteEmail.value = ''
}

async function handleRemove(shareId: number, email: string) {
  const confirmed = await ask({
    title: `Revocare l'accesso a ${email}?`,
    description: 'Potrà ancora vedere le attività già caricate fino all\'aggiornamento della pagina, ma non avrà più accesso.',
    confirmLabel: 'Revoca accesso',
    tone: 'danger',
    icon: 'i-lucide-user-minus'
  })
  if (confirmed) {
    await removeShare(shareId)
  }
}
</script>

<template>
  <AppModal
    :open="open"
    size="lg"
    icon="i-lucide-share-2"
    title="Condividi le tue attività"
    subtitle="Invita una persona su un gruppo o sull'intera lista"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-5">
      <form class="space-y-3" @submit.prevent="handleShare">
        <div class="space-y-1.5">
          <label for="share-email" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Email del collaboratore
          </label>
          <input
            id="share-email"
            v-model="inviteEmail"
            type="email"
            required
            placeholder="collega@esempio.com"
            class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
        </div>

        <div class="space-y-1.5">
          <label for="share-group" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Cosa condividere
          </label>
          <select
            id="share-group"
            v-model="inviteGroup"
            class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-800 focus:border-accent-500 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option :value="ALL_GROUPS">Tutte le liste</option>
            <option v-for="group in availableGroups" :key="group" :value="group">
              {{ group }}
            </option>
          </select>
        </div>

        <div class="space-y-1.5">
          <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Permesso</span>
          <SegmentedControl
            v-model="invitePermission"
            :options="permissionOptions"
            aria-label="Permesso"
            size="md"
            wrap
          />
        </div>

        <UButton
          type="submit"
          block
          size="md"
          color="primary"
          :loading="isSharing"
          :disabled="!inviteEmail.trim() || isSharing"
          icon="i-lucide-user-plus"
          class="rounded-xl font-semibold"
        >
          Invia invito
        </UButton>
      </form>

      <!-- People with access -->
      <div class="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <h3 class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
          Persone con accesso ({{ myShares.length }})
        </h3>

        <p v-if="myShares.length === 0" class="rounded-xl bg-slate-50 py-4 text-center text-xs text-slate-400 dark:bg-slate-800/40">
          Nessun collaboratore ancora invitato.
        </p>

        <ul v-else class="space-y-1.5">
          <li
            v-for="share in myShares"
            :key="share.id"
            class="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/60"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-[11px] font-bold text-accent-700 dark:text-accent-300">
                {{ share.shared_with_email.charAt(0).toUpperCase() }}
              </span>
              <div class="min-w-0">
                <p class="truncate font-medium text-slate-900 dark:text-white">
                  {{ share.shared_with_email }}
                </p>
                <p class="todo-meta mt-0.5 flex items-center gap-1 text-slate-400">
                  <UIcon :name="share.group_name ? groupMeta(share.group_name).icon : 'i-lucide-layers'" class="h-3 w-3 flex-shrink-0" />
                  <span>{{ share.group_name || 'Tutte le liste' }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ share.permission === 'edit' ? 'Puo modificare' : 'Sola lettura' }}</span>
                  <span v-if="share.created_at" aria-hidden="true">·</span>
                  <span v-if="share.created_at">{{ formatShortDate(share.created_at) }}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:outline-none dark:hover:bg-red-950/40 dark:hover:text-red-400"
              :aria-label="`Revoca l'accesso a ${share.shared_with_email}`"
              title="Revoca accesso"
              @click="handleRemove(share.id, share.shared_with_email)"
            >
              <UIcon name="i-lucide-user-minus" class="h-4 w-4" />
            </button>
          </li>
        </ul>
      </div>

      <!-- Shared with me -->
      <div v-if="receivedShares.length > 0" class="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <h3 class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
          Condivisi con te ({{ receivedShares.length }})
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="share in receivedShares"
            :key="share.id"
            class="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/60 p-2.5 text-xs dark:border-sky-950 dark:bg-sky-950/30"
          >
            <UIcon name="i-lucide-inbox" class="h-4 w-4 flex-shrink-0 text-sky-600 dark:text-sky-400" />
            <div class="min-w-0">
              <p class="truncate font-medium text-slate-900 dark:text-white">
                {{ share.group_name || 'Intera lista' }}
              </p>
              <p class="todo-meta text-slate-500 dark:text-slate-400">
                {{ share.permission === 'edit' ? 'Puo modificare' : 'Sola lettura' }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </AppModal>
</template>
