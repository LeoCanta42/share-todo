<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const { loading, loginWithEmail, signUpWithEmail } = useAuth()

type AuthMode = 'login' | 'signup'

const mode = ref<AuthMode>('login')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const formError = ref('')

const isSignup = computed(() => mode.value === 'signup')

const submitLabel = computed(() => (isSignup.value ? 'Crea account' : 'Accedi'))

const modeOptions = [
  { id: 'login', label: 'Accedi' },
  { id: 'signup', label: 'Registrati' }
]

function switchMode(next: AuthMode) {
  if (mode.value === next) return
  mode.value = next
  formError.value = ''
  password.value = ''
  confirmPassword.value = ''
}

function validate(): boolean {
  formError.value = ''
  const trimmedEmail = email.value.trim()

  if (!trimmedEmail) {
    formError.value = 'Inserisci la tua email.'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    formError.value = 'Il formato dell\'email non è valido.'
    return false
  }
  if (password.value.length < 6) {
    formError.value = 'La password deve contenere almeno 6 caratteri.'
    return false
  }
  if (isSignup.value && password.value !== confirmPassword.value) {
    formError.value = 'Le due password non coincidono.'
    return false
  }
  return true
}

async function handleSubmit() {
  if (loading.value || !validate()) return

  const success = isSignup.value
    ? await signUpWithEmail(email.value, password.value)
    : await loginWithEmail(email.value, password.value)

  if (success) {
    password.value = ''
    confirmPassword.value = ''
  }
}
</script>

<template>
  <div class="flex items-center justify-center py-8 sm:py-16">
    <div class="w-full max-w-md">
      <!-- Brand -->
      <div class="mb-8 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-accent text-white shadow-lg shadow-accent-600/25">
          <UIcon name="i-lucide-check" class="h-7 w-7" />
        </div>
        <h2 class="mt-4 text-2xl font-bold text-slate-900 dark:text-white">
          Benvenuto su <span class="text-gradient-accent">ShareToDo</span>
        </h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Accedi per gestire le tue attività e condividerle con altre persone.
        </p>
      </div>

      <!-- Auth card -->
      <div class="surface-card space-y-5 rounded-3xl p-5 sm:p-7">
        <SegmentedControl
          :model-value="mode"
          :options="modeOptions"
          aria-label="Accedi o registrati"
          size="md"
          class="w-full"
          @update:model-value="(value) => switchMode(value as AuthMode)"
        />

        <form class="space-y-3.5" @submit.prevent="handleSubmit">
          <div class="space-y-1.5">
            <label for="auth-email" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="auth-email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              placeholder="tu@esempio.com"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              :disabled="loading"
            >
          </div>

          <div class="space-y-1.5">
            <label for="auth-password" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="auth-password"
              v-model="password"
              type="password"
              :autocomplete="isSignup ? 'new-password' : 'current-password'"
              required
              placeholder="••••••••"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              :disabled="loading"
            >
          </div>

          <div v-if="isSignup" class="space-y-1.5">
            <label for="auth-password-confirm" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Conferma password
            </label>
            <input
              id="auth-password-confirm"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              required
              placeholder="••••••••"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              :disabled="loading"
            >
          </div>

          <p
            v-if="formError"
            class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            <UIcon name="i-lucide-alert-circle" class="h-3.5 w-3.5 flex-shrink-0" />
            <span>{{ formError }}</span>
          </p>

          <UButton
            type="submit"
            block
            size="md"
            color="primary"
            :loading="loading"
            :disabled="loading"
            :icon="isSignup ? 'i-lucide-user-plus' : 'i-lucide-log-in'"
            class="rounded-xl font-semibold"
          >
            {{ submitLabel }}
          </UButton>
        </form>

        <p class="text-center text-xs text-slate-500 dark:text-slate-400">
          <template v-if="isSignup">
            Hai già un account?
            <button type="button" class="font-semibold text-accent-700 hover:underline dark:text-accent-400" @click="switchMode('login')">
              Accedi
            </button>
          </template>
          <template v-else>
            Non hai un account?
            <button type="button" class="font-semibold text-accent-700 hover:underline dark:text-accent-400" @click="switchMode('signup')">
              Registrati
            </button>
          </template>
        </p>
      </div>

      <!-- Feature highlights -->
      <div class="mt-8 grid grid-cols-3 gap-3 text-center">
        <div class="space-y-1.5">
          <div class="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-950/60 dark:text-accent-400">
            <UIcon name="i-lucide-list-checks" class="h-4 w-4" />
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Attività personali</p>
        </div>
        <div class="space-y-1.5">
          <div class="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-950/60 dark:text-accent-400">
            <UIcon name="i-lucide-folder-tree" class="h-4 w-4" />
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Gruppi personalizzati</p>
        </div>
        <div class="space-y-1.5">
          <div class="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-950/60 dark:text-accent-400">
            <UIcon name="i-lucide-users" class="h-4 w-4" />
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Liste condivise</p>
        </div>
      </div>

      <p class="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
        Installabile come app su desktop e mobile: «Installa app» nel menu del browser.
      </p>
    </div>
  </div>
</template>
