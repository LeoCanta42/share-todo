<script setup lang="ts">
import type { ApprovalStatus } from '~/types/profile'

/**
 * The screen an account sees before it may use the app.
 *
 * Two states, deliberately distinct: `unknown` while the profile is being fetched
 * (so an approved user never sees the waiting screen flash), and `pending` once the
 * server has confirmed the account is not approved yet.
 */
const props = defineProps<{ status: ApprovalStatus }>()

const { refreshProfile, loading } = useProfile()
const { logout } = useAuth()
const toast = useToast()

async function recheck() {
  await refreshProfile()

  // Still pending after the re-read: say so, otherwise the button looks broken.
  if (props.status === 'pending') {
    toast.add({
      title: 'Approvazione ancora in sospeso',
      description: 'Un amministratore deve ancora approvare il tuo account.',
      color: 'info'
    })
  }
}
</script>

<template>
  <div class="flex items-center justify-center py-10 sm:py-20">
    <!-- Checking: the profile has not been read yet -->
    <div v-if="status === 'unknown'" class="w-full max-w-sm space-y-3" aria-busy="true" aria-live="polite">
      <div class="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div class="mx-auto h-3.5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div class="mx-auto h-3 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
      <p class="sr-only">Verifica dell'accesso in corso…</p>
    </div>

    <!-- Pending: signed up, waiting for an admin -->
    <div v-else class="anim-rise w-full max-w-md">
      <div class="surface-card space-y-5 rounded-3xl p-5 text-center sm:p-7">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <UIcon name="i-lucide-hourglass" class="h-7 w-7" />
        </div>

        <div class="space-y-1.5">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            Account in attesa di approvazione
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            La registrazione è andata a buon fine, ma un amministratore deve ancora
            abilitare il tuo account. Le tue attività e le tue note saranno visibili
            non appena verrà approvato.
          </p>
        </div>

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <UButton
            color="neutral"
            variant="soft"
            size="md"
            icon="i-lucide-log-out"
            class="justify-center rounded-xl"
            @click="logout"
          >
            Disconnetti
          </UButton>
          <UButton
            color="primary"
            size="md"
            icon="i-lucide-refresh-cw"
            class="justify-center rounded-xl font-semibold"
            :loading="loading"
            @click="recheck"
          >
            Ricontrolla
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
