<script setup lang="ts">
import { ACCENTS, DENSITIES, SORT_ORDERS, TEXT_SIZES, usePreferences } from '~/composables/usePreferences'
import { useAppearance } from '~/composables/useAppearance'
import { useConfirm } from '~/composables/useConfirm'
import { usePwa } from '~/composables/usePwa'
import { useAuth } from '~/composables/useAuth'
import { MIN_PASSWORD_LENGTH } from '~/utils/password'
import { GROUP_ICONS, GROUP_TONES } from '~/utils/groups'

/**
 * Everything the user can tailor: appearance, list behaviour, their own groups
 * (name + colour + icon), their password, and the PWA install/update actions.
 *
 * Reads the shared composables directly instead of taking a dozen props: they are
 * backed by `useState`/`useCookie`, so this is the same state the rest of the app
 * reads.
 */
const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { prefs, update, reset } = usePreferences()
const { theme, setTheme, setAccent } = useAppearance()
const { availableGroups, customGroups, removedGroups, groupStats, groupMeta, isCustomGroup, isFallbackGroup, addGroup, setGroupStyle, clearGroupStyle, deleteGroup, restoreGroup, restoreAllGroups } = useTodos()
const { canInstall, install, needRefresh, updateApp, isIos, offlineReady, isInstalled, manualInstallHint } = usePwa()
const { changePassword, loading: authLoading } = useAuth()
const { userEmail } = useCurrentUser()
const { ask } = useConfirm()
const toast = useToast()

type Tab = 'aspetto' | 'attivita' | 'gruppi' | 'sicurezza' | 'app'
const tab = ref<Tab>('aspetto')

const tabs = [
  { id: 'aspetto', label: 'Aspetto', icon: 'i-lucide-palette' },
  { id: 'attivita', label: 'Attività', icon: 'i-lucide-list-checks' },
  { id: 'gruppi', label: 'Gruppi', icon: 'i-lucide-folder-tree' },
  { id: 'sicurezza', label: 'Sicurezza', icon: 'i-lucide-key-round' },
  { id: 'app', label: 'App', icon: 'i-lucide-smartphone' }
]

/* ------------------------------------------------------------ own password */
const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const passwordError = ref('')

const passwordFormValid = computed(() =>
  currentPassword.value.length > 0
  && newPassword.value.length >= MIN_PASSWORD_LENGTH
  && newPassword.value === confirmNewPassword.value
)

function resetPasswordForm() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmNewPassword.value = ''
  passwordError.value = ''
}

async function submitPasswordChange() {
  passwordError.value = ''

  if (!currentPassword.value) {
    passwordError.value = 'Inserisci la password attuale.'
    return
  }
  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    passwordError.value = `La nuova password deve contenere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
    return
  }
  if (newPassword.value !== confirmNewPassword.value) {
    passwordError.value = 'Le due nuove password non coincidono.'
    return
  }

  const changed = await changePassword(currentPassword.value, newPassword.value)
  if (changed) {
    resetPasswordForm()
  }
}

// Never leave a half-typed password behind when the dialog closes.
watch(() => props.open, (open) => {
  if (!open) resetPasswordForm()
})

const expandedGroup = ref<string | null>(null)
const newGroupName = ref('')

const themeOptions = [
  { id: 'light', label: 'Chiaro', icon: 'i-lucide-sun' },
  { id: 'dark', label: 'Scuro', icon: 'i-lucide-moon' },
  { id: 'system', label: 'Sistema', icon: 'i-lucide-monitor' }
]

const groupRows = computed(() => availableGroups.value.map(name => ({
  name,
  meta: groupMeta(name),
  count: groupStats.value[name]?.total ?? 0,
  active: groupStats.value[name]?.active ?? 0,
  custom: isCustomGroup(name),
  fallback: isFallbackGroup(name)
})))

const installHint = computed(() => {
  if (isInstalled.value) return 'App già installata su questo dispositivo.'
  return manualInstallHint.value
})

function submitNewGroup() {
  const name = addGroup(newGroupName.value)
  if (name) {
    newGroupName.value = ''
    expandedGroup.value = name
    toast.add({ title: 'Gruppo creato', description: `"${name}" è ora disponibile.`, color: 'success' })
  }
}

async function requestRemoveGroup(row: { name: string, count: number, custom: boolean }) {
  const confirmed = await ask({
    title: `Eliminare il gruppo "${row.name}"?`,
    description: [
      row.count > 0
        ? `${row.count} attività verranno spostate nel gruppo "Generale".`
        : 'Il gruppo è vuoto.',
      row.custom
        ? 'Il gruppo personalizzato verrà rimosso definitivamente.'
        : 'È un gruppo predefinito: potrai ripristinarlo da questa schermata.'
    ].join(' '),
    confirmLabel: 'Elimina gruppo',
    tone: 'danger',
    icon: 'i-lucide-folder-x'
  })
  if (confirmed) {
    await deleteGroup(row.name)
    expandedGroup.value = null
  }
}

async function requestReset() {
  const confirmed = await ask({
    title: 'Reimpostare le preferenze?',
    description: 'Colori, densità, ordine e gruppi personalizzati torneranno ai valori iniziali. Le attività non vengono toccate.',
    confirmLabel: 'Reimposta',
    tone: 'danger'
  })
  if (confirmed) {
    reset()
    toast.add({ title: 'Preferenze reimpostate', color: 'neutral' })
  }
}

async function handleInstall() {
  const outcome = await install()
  if (outcome === 'accepted') {
    toast.add({ title: 'Installazione avviata', description: 'Trovi l\'app nella schermata Home.', color: 'success' })
  } else if (!outcome) {
    toast.add({
      title: 'Installazione manuale',
      description: 'Apri il menu del browser e scegli "Installa app" / "Aggiungi a Home".',
      color: 'info'
    })
  }
}
</script>

<template>
  <AppModal
    :open="open"
    size="lg"
    full-height
    icon="i-lucide-sliders-horizontal"
    title="Personalizza"
    subtitle="Aspetto, comportamento e gruppi"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-5">
      <SegmentedControl
        v-model="tab"
        :options="tabs"
        aria-label="Sezioni delle impostazioni"
        wrap
        size="md"
      />

      <!-- ---------------------------------------------------------------- -->
      <section v-if="tab === 'aspetto'" class="anim-fade space-y-5">
        <div class="space-y-2.5">
          <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Colore accento
          </h3>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="accent in ACCENTS"
              :key="accent.id"
              type="button"
              class="h-9 w-9 rounded-xl border border-black/5 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:outline-none dark:border-white/10"
              :style="{ backgroundColor: accent.swatch }"
              :aria-pressed="prefs.accent === accent.id"
              :aria-label="`Accento ${accent.label}`"
              :title="accent.label"
              @click="setAccent(accent.id)"
            >
              <UIcon
                v-if="prefs.accent === accent.id"
                name="i-lucide-check"
                class="mx-auto h-4 w-4 text-white drop-shadow"
              />
            </button>
          </div>
        </div>

        <div class="space-y-2.5">
          <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Tema
          </h3>
          <SegmentedControl
            :model-value="theme"
            :options="themeOptions"
            aria-label="Tema"
            size="md"
            wrap
            @update:model-value="(value) => setTheme(value as 'light' | 'dark' | 'system')"
          />
        </div>

        <div class="space-y-2.5">
          <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Densità e testo dell'elenco
          </h3>
          <SegmentedControl
            :model-value="prefs.density"
            :options="DENSITIES"
            aria-label="Densità"
            wrap
            @update:model-value="(value) => update('density', value as typeof prefs.density)"
          />
          <p class="todo-meta text-slate-400 dark:text-slate-500">
            {{ DENSITIES.find(d => d.id === prefs.density)?.hint }}
          </p>
        </div>

        <div class="space-y-2.5">
          <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Dimensione del testo
          </h3>
          <SegmentedControl
            :model-value="prefs.textSize"
            :options="TEXT_SIZES"
            aria-label="Dimensione del testo"
            wrap
            @update:model-value="(value) => update('textSize', value as typeof prefs.textSize)"
          />
          <p class="todo-meta text-slate-400 dark:text-slate-500">
            Vale per l'elenco e per la vista di lettura.
          </p>
        </div>
      </section>

      <!-- ---------------------------------------------------------------- -->
      <section v-else-if="tab === 'attivita'" class="anim-fade space-y-5">
        <div class="space-y-2.5">
          <h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Ordine delle attività
          </h3>
          <div class="space-y-1.5">
            <button
              v-for="order in SORT_ORDERS"
              :key="order.id"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
              :class="prefs.sort === order.id
                ? 'border-accent-500/60 bg-accent-50 text-accent-900 dark:bg-accent-950/40 dark:text-accent-100'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60'"
              :aria-pressed="prefs.sort === order.id"
              @click="update('sort', order.id)"
            >
              <UIcon
                :name="prefs.sort === order.id ? 'i-lucide-circle-dot' : 'i-lucide-circle'"
                class="h-4 w-4 flex-shrink-0"
                :class="prefs.sort === order.id ? 'text-accent-600 dark:text-accent-400' : 'text-slate-300 dark:text-slate-600'"
              />
              <span class="font-medium">{{ order.label }}</span>
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <UCheckbox
            :model-value="prefs.groupSections"
            label="Mostra le intestazioni dei gruppi"
            description="Visibile quando scegli l'ordine «Raggruppate per gruppo»."
            @update:model-value="(value) => update('groupSections', Boolean(value))"
          />
          <UCheckbox
            :model-value="prefs.hideCompleted"
            label="Nascondi le attività completate"
            description="Si applica alla scheda «Tutti»; la scheda «Completati» resta disponibile."
            @update:model-value="(value) => update('hideCompleted', Boolean(value))"
          />
          <UCheckbox
            :model-value="prefs.confirmDelete"
            label="Chiedi conferma prima di eliminare"
            @update:model-value="(value) => update('confirmDelete', Boolean(value))"
          />
        </div>
      </section>

      <!-- ---------------------------------------------------------------- -->
      <section v-else-if="tab === 'gruppi'" class="anim-fade space-y-4">
        <form class="flex items-end gap-2" @submit.prevent="submitNewGroup">
          <div class="flex-1 space-y-1.5">
            <label for="new-group" class="block text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
              Nuovo gruppo
            </label>
            <input
              id="new-group"
              v-model="newGroupName"
              type="text"
              placeholder="es. Viaggi, Salute…"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
          </div>
          <UButton
            type="submit"
            color="primary"
            size="md"
            icon="i-lucide-plus"
            class="rounded-xl font-semibold"
            :disabled="!newGroupName.trim()"
          >
            Crea
          </UButton>
        </form>

        <div class="space-y-2">
          <!-- Removed presets live only in the preferences, so they can always come back -->
          <div
            v-if="removedGroups.length > 0"
            class="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20"
          >
            <div class="flex items-start gap-2.5">
              <UIcon name="i-lucide-archive-restore" class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-amber-900 dark:text-amber-200">
                  {{ removedGroups.length === 1 ? '1 gruppo predefinito rimosso' : `${removedGroups.length} gruppi predefiniti rimossi` }}
                </p>
                <p class="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/70">
                  Le loro attività sono in "Generale". Puoi rimetterli quando vuoi.
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    v-for="name in removedGroups"
                    :key="name"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-lg border border-amber-300/70 bg-white/80 px-2 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:outline-none dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                    :aria-label="`Ripristina il gruppo ${name}`"
                    @click="restoreGroup(name)"
                  >
                    <UIcon name="i-lucide-plus" class="h-3 w-3" />
                    <span>{{ name }}</span>
                  </button>
                  <UButton
                    v-if="removedGroups.length > 1"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-archive-restore"
                    class="rounded-lg"
                    @click="restoreAllGroups()"
                  >
                    Ripristina tutti
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div
            v-for="row in groupRows"
            :key="row.name"
            class="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
          >
            <div class="flex items-center gap-2.5 p-3">
              <span
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                :class="row.meta.colorClass"
              >
                <UIcon :name="row.meta.icon" class="h-4 w-4" />
              </span>

              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {{ row.name }}
                </p>
                <p class="todo-meta text-slate-400 dark:text-slate-500">
                  {{ row.count }} attività · {{ row.active }} da fare
                  <span v-if="row.custom"> · tuo</span>
                </p>
              </div>

              <button
                type="button"
                class="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                :aria-expanded="expandedGroup === row.name"
                @click="expandedGroup = expandedGroup === row.name ? null : row.name"
              >
                <UIcon :name="expandedGroup === row.name ? 'i-lucide-chevron-up' : 'i-lucide-palette'" class="h-3.5 w-3.5" />
                <span class="hidden sm:inline">Stile</span>
              </button>
              <UButton
                  v-if="!row.fallback"
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-trash-2"
                  class="rounded-lg"
                  @click="requestRemoveGroup(row)"
                >
                  Elimina
              </UButton>
            </div>

            <!-- Inline style editor -->
            <div
              v-if="expandedGroup === row.name"
              class="anim-fade space-y-3 border-t border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40"
            >
              <div class="space-y-1.5">
                <p class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                  Colore
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="tone in GROUP_TONES"
                    :key="tone.id"
                    type="button"
                    class="h-7 w-7 rounded-lg border border-black/5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:outline-none dark:border-white/10"
                    :class="tone.swatch"
                    :aria-label="`Colore ${tone.label}`"
                    :title="tone.label"
                    @click="setGroupStyle(row.name, { tone: tone.id, icon: row.meta.icon })"
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <p class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                  Icona
                </p>
                <div class="grid grid-cols-8 gap-1.5 sm:grid-cols-11">
                  <button
                    v-for="icon in GROUP_ICONS"
                    :key="icon"
                    type="button"
                    class="flex aspect-square items-center justify-center rounded-lg border text-slate-500 transition-colors hover:border-accent-400 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:text-accent-300"
                    :class="row.meta.icon === icon
                      ? 'border-accent-500 bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300'
                      : 'border-slate-200 dark:border-slate-700'"
                    :aria-label="`Icona ${icon.split('-').pop()}`"
                    :aria-pressed="row.meta.icon === icon"
                    @click="setGroupStyle(row.name, { tone: row.meta.tone, icon })"
                  >
                    <UIcon :name="icon" class="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-rotate-ccw"
                  class="rounded-lg"
                  @click="clearGroupStyle(row.name)"
                >
                  Ripristina stile
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <p class="todo-meta text-slate-400 dark:text-slate-500">
          I gruppi che crei restano disponibili anche quando non contengono attività. Anche i gruppi
          predefiniti si possono eliminare: le loro attività tornano in "Generale".
        </p>
      </section>

      <!-- ---------------------------------------------------------------- -->
      <section v-else-if="tab === 'sicurezza'" class="anim-fade space-y-4">
        <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-400">
              <UIcon name="i-lucide-user-round" class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">Il tuo account</h3>
              <p class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {{ userEmail ?? '—' }}
              </p>
            </div>
          </div>
        </div>

        <form
          class="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
          @submit.prevent="submitPasswordChange"
        >
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Cambia password</h3>
            <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              La password attuale viene verificata prima del cambio.
            </p>
          </div>

          <div class="space-y-1.5">
            <label for="pwd-current" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Password attuale
            </label>
            <input
              id="pwd-current"
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              :disabled="authLoading"
            >
          </div>

          <div class="space-y-1.5">
            <label for="pwd-new" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nuova password
            </label>
            <input
              id="pwd-new"
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              :placeholder="`Almeno ${MIN_PASSWORD_LENGTH} caratteri`"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              :disabled="authLoading"
            >
          </div>

          <div class="space-y-1.5">
            <label for="pwd-confirm" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Conferma la nuova password
            </label>
            <input
              id="pwd-confirm"
              v-model="confirmNewPassword"
              type="password"
              autocomplete="new-password"
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 placeholder-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              :disabled="authLoading"
            >
          </div>

          <p
            v-if="passwordError"
            class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            <UIcon name="i-lucide-alert-circle" class="h-3.5 w-3.5 flex-shrink-0" />
            <span>{{ passwordError }}</span>
          </p>

          <UButton
            type="submit"
            color="primary"
            size="md"
            icon="i-lucide-key-round"
            class="rounded-xl font-semibold"
            :loading="authLoading"
            :disabled="!passwordFormValid || authLoading"
          >
            Aggiorna password
          </UButton>
        </form>
      </section>

      <!-- ---------------------------------------------------------------- -->
      <section v-else class="anim-fade space-y-4">
        <div class="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl gradient-accent text-white shadow-sm">
              <UIcon name="i-lucide-download" class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">Installa sul dispositivo</h3>
              <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {{ installHint ?? 'Avvio istantaneo, icona dedicata e shell disponibile anche offline.' }}
              </p>

              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  v-if="canInstall"
                  color="primary"
                  size="sm"
                  icon="i-lucide-smartphone"
                  class="rounded-xl font-semibold"
                  @click="handleInstall"
                >
                  Installa app
                </UButton>
                <span
                  v-else-if="isInstalled"
                  class="inline-flex items-center gap-1.5 rounded-xl bg-accent-50 px-3 py-1.5 text-xs font-semibold text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"
                >
                  <UIcon name="i-lucide-badge-check" class="h-3.5 w-3.5" />
                  App installata
                </span>
                <UButton
                  v-if="needRefresh"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-refresh-cw"
                  class="rounded-xl"
                  @click="updateApp"
                >
                  Aggiorna alla nuova versione
                </UButton>
                <span
                  v-if="offlineReady && !needRefresh"
                  class="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  <UIcon name="i-lucide-cloud-off" class="h-3.5 w-3.5" />
                  Pronta per l'uso offline
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Reimposta preferenze</h3>
            <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Torna ai colori e alle opzioni predefinite.
            </p>
          </div>
          <UButton
            color="error"
            variant="soft"
            size="sm"
            icon="i-lucide-rotate-ccw"
            class="rounded-xl"
            @click="requestReset"
          >
            Reimposta
          </UButton>
        </div>
      </section>
    </div>
  </AppModal>
</template>
