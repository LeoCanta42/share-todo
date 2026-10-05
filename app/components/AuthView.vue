<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const { loading, loginWithGoogle, loginWithEmail, signUpWithEmail } = useAuth()

type AuthMode = 'login' | 'signup'

const mode = ref<AuthMode>('login')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const formError = ref('')

const isSignup = computed(() => mode.value === 'signup')

const submitLabel = computed(() => (isSignup.value ? 'Crea account' : 'Accedi'))

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

async function handleGoogle() {
  if (loading.value) return
  formError.value = ''
  await loginWithGoogle()
}
</script>

<template>
  <div class="py-10 sm:py-16 flex items-center justify-center">
    <div class="w-full max-w-md">
      <!-- Brand / Hero -->
      <div class="text-center mb-8">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25">
          <UIcon name="i-lucide-check-check" class="w-7 h-7" />
        </div>
        <h2 class="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
          Benvenuto su Nuxt Todo
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Accedi per gestire le tue attività e condividerle con altri utenti.
        </p>
      </div>

      <!-- Auth card -->
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 shadow-xl shadow-gray-900/5 dark:shadow-black/20 space-y-5">
        <!-- Mode switch -->
        <div class="inline-flex w-full p-0.5 bg-gray-100 dark:bg-gray-800/80 rounded-xl gap-1 text-sm">
          <button
            type="button"
            class="flex-1 px-3 py-2 rounded-lg font-medium transition-all"
            :class="[
              !isSignup
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            ]"
            @click="switchMode('login')"
          >
            Accedi
          </button>
          <button
            type="button"
            class="flex-1 px-3 py-2 rounded-lg font-medium transition-all"
            :class="[
              isSignup
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            ]"
            @click="switchMode('signup')"
          >
            Registrati
          </button>
        </div>

        <!-- Google OAuth -->
        <UButton
          block
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-chrome"
          :loading="loading"
          class="rounded-xl font-medium"
          @click="handleGoogle"
        >
          Continua con Google
        </UButton>

        <!-- Divider -->
        <div class="flex items-center gap-3 text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
          <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          oppure con email
          <span class="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        </div>

        <!-- Email / password form -->
        <form class="space-y-3.5" @submit.prevent="handleSubmit">
          <div class="space-y-1.5">
            <label for="auth-email" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Email
            </label>
            <input
              id="auth-email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              placeholder="tu@esempio.com"
              class="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              :disabled="loading"
            >
          </div>

          <div class="space-y-1.5">
            <label for="auth-password" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              id="auth-password"
              v-model="password"
              type="password"
              :autocomplete="isSignup ? 'new-password' : 'current-password'"
              required
              placeholder="••••••••"
              class="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              :disabled="loading"
            >
          </div>

          <div v-if="isSignup" class="space-y-1.5">
            <label for="auth-password-confirm" class="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Conferma password
            </label>
            <input
              id="auth-password-confirm"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              required
              placeholder="••••••••"
              class="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              :disabled="loading"
            >
          </div>

          <!-- Inline validation error -->
          <p
            v-if="formError"
            class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            <UIcon name="i-lucide-alert-circle" class="w-3.5 h-3.5 flex-shrink-0" />
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

        <p class="text-center text-xs text-gray-500 dark:text-gray-400">
          <template v-if="isSignup">
            Hai già un account?
            <button type="button" class="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline" @click="switchMode('login')">
              Accedi
            </button>
          </template>
          <template v-else>
            Non hai un account?
            <button type="button" class="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline" @click="switchMode('signup')">
              Registrati
            </button>
          </template>
        </p>
      </div>

      <!-- Feature highlights -->
      <div class="mt-8 grid grid-cols-3 gap-3 text-center">
        <div class="space-y-1.5">
          <div class="w-8 h-8 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <UIcon name="i-lucide-list-checks" class="w-4 h-4" />
          </div>
          <p class="text-[11px] text-gray-500 dark:text-gray-400">Task personali</p>
        </div>
        <div class="space-y-1.5">
          <div class="w-8 h-8 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <UIcon name="i-lucide-folder-tree" class="w-4 h-4" />
          </div>
          <p class="text-[11px] text-gray-500 dark:text-gray-400">Sottogruppi</p>
        </div>
        <div class="space-y-1.5">
          <div class="w-8 h-8 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <UIcon name="i-lucide-users" class="w-4 h-4" />
          </div>
          <p class="text-[11px] text-gray-500 dark:text-gray-400">Liste condivise</p>
        </div>
      </div>
    </div>
  </div>
</template>
