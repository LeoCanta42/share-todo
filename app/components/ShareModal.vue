<script setup lang="ts">
import type { TodoShare } from '~/types/todo'

const props = defineProps<{
  isOpen: boolean
  shares: TodoShare[]
  isSharing?: boolean
  availableGroups?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', value: boolean): void
  (e: 'share', email: string, permission: 'read' | 'edit', group: string | null): void
  (e: 'remove', shareId: number): void
}>()

/** Sentinel for the <select>: the database stores "whole list" as NULL. */
const ALL_GROUPS = '__all__'

const inviteEmail = ref('')
const invitePermission = ref<'edit' | 'read'>('edit')
const inviteGroup = ref<string>(ALL_GROUPS)

function handleShare() {
  const trimmed = inviteEmail.value.trim()
  if (!trimmed || props.isSharing) return

  emit(
    'share',
    trimmed,
    invitePermission.value,
    inviteGroup.value === ALL_GROUPS ? null : inviteGroup.value
  )
  inviteEmail.value = ''
}

function groupLabel(groupName: string | null): string {
  return groupName || 'Tutte le liste'
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
  >
    <div
      class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <UIcon name="i-lucide-share-2" class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-base text-gray-900 dark:text-white">Condividi le tue attività</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Scegli un gruppo oppure l'intera lista</p>
          </div>
        </div>

        <button
          type="button"
          class="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          @click="emit('update:isOpen', false)"
        >
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <!-- Invite form -->
      <form class="space-y-3 pt-1" @submit.prevent="handleShare">
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Email del collaboratore
          </label>
          <input
            v-model="inviteEmail"
            type="email"
            required
            placeholder="collega@esempio.com"
            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          >
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Cosa condividere
            </label>
            <select
              v-model="inviteGroup"
              class="w-full px-2.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
            >
              <option :value="ALL_GROUPS">Tutte le liste</option>
              <option v-for="g in availableGroups" :key="g" :value="g">
                {{ g }}
              </option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Permesso
            </label>
            <select
              v-model="invitePermission"
              class="w-full px-2.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
            >
              <option value="edit">Può modificare</option>
              <option value="read">Sola lettura</option>
            </select>
          </div>
        </div>

        <UButton
          type="submit"
          block
          size="sm"
          color="primary"
          :loading="isSharing"
          :disabled="!inviteEmail.trim() || isSharing"
          icon="i-lucide-user-plus"
          class="rounded-xl font-medium"
        >
          Invia invito
        </UButton>
      </form>

      <!-- Active Collaborators List -->
      <div class="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Persone con accesso ({{ shares.length }})
        </div>

        <div v-if="shares.length === 0" class="text-xs text-gray-400 text-center py-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-xl">
          Nessun collaboratore ancora invitato.
        </div>

        <div v-else class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          <div
            v-for="s in shares"
            :key="s.id"
            class="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs"
          >
            <div class="flex items-center gap-2 min-w-0 pr-2">
              <div class="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                {{ s.shared_with_email.charAt(0).toUpperCase() }}
              </div>
              <div class="truncate">
                <span class="font-medium text-gray-900 dark:text-white truncate block">
                  {{ s.shared_with_email }}
                </span>
                <span class="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                  <UIcon
                    :name="s.group_name ? 'i-lucide-folder' : 'i-lucide-layers'"
                    class="w-3 h-3 flex-shrink-0"
                  />
                  <span>{{ groupLabel(s.group_name) }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ s.permission === 'edit' ? 'Può modificare' : 'Sola lettura' }}</span>
                </span>
              </div>
            </div>

            <button
              type="button"
              class="text-gray-400 hover:text-red-500 p-1 transition-colors flex-shrink-0"
              title="Revoca accesso"
              @click="emit('remove', s.id)"
            >
              <UIcon name="i-lucide-trash" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
