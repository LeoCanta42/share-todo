<script setup lang="ts">
import { useAdmin } from '~/composables/useAdmin'
import { useProfile } from '~/composables/useProfile'
import { useConfirm } from '~/composables/useConfirm'
import { generatePassword, MIN_PASSWORD_LENGTH } from '~/utils/password'
import { formatShortDate } from '~/utils/date'
import type { AdminUser } from '~/types/profile'

/**
 * User management.
 *
 * Nothing here is enforced client-side: the guard keeps non-admins from landing on
 * an empty table, and every action is a server function that re-checks the caller's
 * `is_admin` flag. The buttons are only disabled for the cases the database refuses
 * outright (an admin deleting or demoting themselves).
 */
definePageMeta({ middleware: 'admin' })

const {
  users,
  loading,
  loaded,
  busyId,
  pendingCount,
  loadUsers,
  setApproved,
  resetPassword,
  deleteUser,
  isSelf
} = useAdmin()
const { refreshProfile } = useProfile()
const { ask } = useConfirm()
const toast = useToast()

type Filter = 'all' | 'pending' | 'admins'

const filter = ref<Filter>('all')
const search = ref('')

/** Which user's password panel is open, and the draft password for it. */
const expandedId = ref<string | null>(null)
const draftPassword = ref('')
const revealPassword = ref(false)
const copied = ref(false)

if (!loaded.value) {
  await loadUsers()
}

const filterOptions = computed(() => [
  { id: 'all', label: 'Tutti', count: users.value.length },
  { id: 'pending', label: 'Da approvare', count: pendingCount.value },
  { id: 'admins', label: 'Amministratori', count: users.value.filter(u => u.is_admin).length }
])

const visibleUsers = computed(() => {
  let list = users.value

  if (filter.value === 'pending') {
    list = list.filter(u => !u.approved)
  } else if (filter.value === 'admins') {
    list = list.filter(u => u.is_admin)
  }

  const query = search.value.trim().toLowerCase()
  if (query) {
    list = list.filter(u => (u.email ?? '').toLowerCase().includes(query))
  }

  return list
})

async function refresh() {
  await Promise.all([loadUsers(), refreshProfile()])
}

/* --------------------------------------------------------- password panel */
function togglePasswordPanel(user: AdminUser) {
  if (expandedId.value === user.id) {
    expandedId.value = null
    return
  }

  expandedId.value = user.id
  revealPassword.value = false
  copied.value = false
  // A ready-to-use password: setting an empty field by accident is the most likely
  // mistake here, and a generated one is stronger than anything typed in a hurry.
  draftPassword.value = generatePassword()
}

function regenerate() {
  draftPassword.value = generatePassword()
  revealPassword.value = true
}

async function copyPassword() {
  if (!import.meta.client || !draftPassword.value) return
  try {
    await navigator.clipboard.writeText(draftPassword.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch (error) {
    console.error('Clipboard unavailable:', error)
  }
}

async function applyPassword(user: AdminUser) {
  if (draftPassword.value.length < MIN_PASSWORD_LENGTH) {
    toast.add({
      title: 'Password troppo corta',
      description: `Usa almeno ${MIN_PASSWORD_LENGTH} caratteri.`,
      color: 'warning'
    })
    return
  }

  const confirmed = await ask({
    title: `Reimpostare la password di ${user.email ?? 'questo utente'}?`,
    description: 'La password attuale smetterà di funzionare. Comunica la nuova password alla persona interessata: non viene inviata alcuna email.',
    confirmLabel: 'Reimposta',
    tone: 'danger',
    icon: 'i-lucide-key-round'
  })
  if (!confirmed) return

  const done = await resetPassword(user, draftPassword.value)
  if (done) {
    expandedId.value = null
    draftPassword.value = ''
  }
}

/* ---------------------------------------------------------------- actions */
async function toggleApproved(user: AdminUser) {
  if (user.approved) {
    const confirmed = await ask({
      title: `Revocare l'accesso a ${user.email ?? 'questo utente'}?`,
      description: 'Non potrà più vedere né modificare attività, note e condivisioni finché non verrà approvato di nuovo.',
      confirmLabel: 'Revoca accesso',
      tone: 'danger',
      icon: 'i-lucide-user-x'
    })
    if (!confirmed) return
  }

  await setApproved(user, !user.approved)
}

async function removeUser(user: AdminUser) {
  const confirmed = await ask({
    title: `Eliminare ${user.email ?? 'questo utente'}?`,
    description: `Verranno eliminati l'account, ${user.todo_count} attività, ${user.note_count} note e ${user.share_count} condivisioni. L'operazione è irreversibile.`,
    confirmLabel: 'Elimina utente',
    tone: 'danger',
    icon: 'i-lucide-trash-2'
  })
  if (confirmed) {
    await deleteUser(user)
  }
}
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-24 sm:space-y-5 sm:px-6 sm:pt-8 sm:pb-14">
    <!-- Header -->
    <section class="anim-rise surface-card rounded-3xl p-4 sm:p-5">
      <div class="flex items-center gap-3">
        <span class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-400">
          <UIcon name="i-lucide-shield-check" class="h-6 w-6" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
            Amministrazione
          </h2>
          <p class="todo-meta mt-0.5 text-slate-500 dark:text-slate-400">
            {{ users.length }} {{ users.length === 1 ? 'utente' : 'utenti' }}
            <template v-if="pendingCount > 0">
              · <span class="font-semibold text-amber-600 dark:text-amber-400">{{ pendingCount }} da approvare</span>
            </template>
          </p>
        </div>
        <UButton
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-lucide-refresh-cw"
          class="rounded-xl"
          :loading="loading"
          @click="refresh"
        >
          Ricarica
        </UButton>
      </div>
    </section>

    <!-- Filters -->
    <section class="space-y-2">
      <SegmentedControl
        :model-value="filter"
        :options="filterOptions"
        aria-label="Filtra gli utenti"
        size="sm"
        wrap
        @update:model-value="(value) => filter = value as Filter"
      />

      <div class="relative">
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          :value="search"
          type="search"
          placeholder="Cerca per email…"
          class="w-full rounded-xl border border-transparent bg-slate-100 py-2 pr-8 pl-8 text-base text-slate-900 transition-all placeholder-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none sm:text-xs dark:bg-slate-800/80 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-900"
          aria-label="Cerca utenti per email"
          @input="search = ($event.target as HTMLInputElement).value"
        >
      </div>
    </section>

    <!-- Empty state -->
    <div
      v-if="visibleUsers.length === 0"
      class="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-900/30"
    >
      <UIcon :name="search ? 'i-lucide-search-x' : 'i-lucide-users'" class="mx-auto mb-2 h-6 w-6 text-slate-400" />
      <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {{ search ? 'Nessun utente trovato' : 'Nessun utente' }}
      </p>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {{ search ? 'Nessuna email corrisponde alla ricerca.' : 'Non ci sono ancora utenti registrati.' }}
      </p>
    </div>

    <!-- Users -->
    <ul v-else class="space-y-2">
      <li
        v-for="user in visibleUsers"
        :key="user.id"
        class="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-start gap-3 p-3.5">
          <span
            class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
            :class="user.approved
              ? 'bg-accent-100 text-accent-700 dark:bg-accent-950/70 dark:text-accent-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'"
          >
            {{ (user.email ?? '?').charAt(0).toUpperCase() }}
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {{ user.email ?? 'Utente senza email' }}
              <span v-if="isSelf(user)" class="todo-meta ml-1 font-bold text-accent-600 dark:text-accent-400">(tu)</span>
            </p>

            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                :class="user.approved
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'"
              >
                <UIcon :name="user.approved ? 'i-lucide-check-circle-2' : 'i-lucide-hourglass'" class="h-3 w-3" />
                <span class="todo-meta">{{ user.approved ? 'Approvato' : 'In attesa' }}</span>
              </span>

              <span
                v-if="user.is_admin"
                class="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
              >
                <UIcon name="i-lucide-shield-check" class="h-3 w-3" />
                <span class="todo-meta">Admin</span>
              </span>

              <span class="todo-meta text-slate-400 dark:text-slate-500">
                {{ user.todo_count }} attività · {{ user.note_count }} note · {{ user.share_count }} condivisioni
              </span>
            </div>

            <p class="todo-meta mt-1 text-slate-400 dark:text-slate-500">
              Registrato {{ formatShortDate(user.created_at) || '—' }}
              <template v-if="user.last_sign_in_at"> · ultimo accesso {{ formatShortDate(user.last_sign_in_at) }}</template>
              <template v-else> · mai entrato</template>
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <UButton
            :color="user.approved ? 'error' : 'primary'"
            :variant="user.approved ? 'ghost' : 'soft'"
            size="xs"
            :icon="user.approved ? 'i-lucide-user-x' : 'i-lucide-user-check'"
            class="rounded-lg font-semibold"
            :disabled="busyId === user.id"
            @click="toggleApproved(user)"
          >
            {{ user.approved ? 'Revoca' : 'Approva' }}
          </UButton>

          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            icon="i-lucide-key-round"
            class="rounded-lg font-semibold"
            :disabled="busyId === user.id"
            @click="togglePasswordPanel(user)"
          >
            Reimposta password
          </UButton>
          
          <UButton
            v-if="!isSelf(user)"
            color="error"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            class="ml-auto rounded-lg font-semibold"
            :disabled="busyId === user.id"
            @click="removeUser(user)"
          >
            Elimina
          </UButton>
        </div>

        <!-- Reset password panel -->
        <div
          v-if="expandedId === user.id"
          class="anim-fade space-y-2.5 border-t border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <label
            :for="`pwd-${user.id}`"
            class="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500"
          >
            Nuova password per {{ user.email ?? 'questo utente' }}
          </label>

          <div class="flex flex-wrap items-center gap-2">
            <input
              :id="`pwd-${user.id}`"
              v-model="draftPassword"
              :type="revealPassword ? 'text' : 'password'"
              autocomplete="new-password"
              class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              :icon="revealPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              class="rounded-xl"
              :aria-label="revealPassword ? 'Nascondi la password' : 'Mostra la password'"
              @click="revealPassword = !revealPassword"
            />
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              class="rounded-xl"
              aria-label="Genera una nuova password"
              @click="regenerate"
            />
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              class="rounded-xl"
              aria-label="Copia la password"
              @click="copyPassword"
            />
          </div>

          <p class="todo-meta text-slate-400 dark:text-slate-500">
            Almeno {{ MIN_PASSWORD_LENGTH }} caratteri. La password va comunicata a mano:
            l'app non invia email.
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="primary"
              size="sm"
              icon="i-lucide-key-round"
              class="rounded-xl font-semibold"
              :loading="busyId === user.id"
              :disabled="busyId === user.id"
              @click="applyPassword(user)"
            >
              Imposta password
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              class="rounded-xl"
              @click="expandedId = null"
            >
              Annulla
            </UButton>
          </div>
        </div>
      </li>
    </ul>

    <footer class="space-y-1 pt-4 text-center text-xs text-slate-400 dark:text-slate-500">
      <p>Ogni azione è verificata dal database: senza permessi di amministratore non ha effetto.</p>
    </footer>
  </main>
</template>
