<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useShares } from '~/composables/useShares'
import { useTodos } from '~/composables/useTodos'
import { useNotes } from '~/composables/useNotes'
import { useProfile } from '~/composables/useProfile'
import { useAppearance } from '~/composables/useAppearance'
import { usePwa } from '~/composables/usePwa'
import { useQuickAdd } from '~/composables/useQuickAdd'
import { useShareDialog } from '~/composables/useShareDialog'
import { useAppBadge } from '~/composables/useAppBadge'
import { useGroups } from '~/composables/useGroups'
import { useNotifications } from '~/composables/useNotifications'
import { useSyncEngine } from '~/composables/useSyncEngine'
import { appleSplashLinks } from '~/utils/appleSplash'

useSeoMeta({
  title: 'ShareToDo — Attività e condivisione',
  description: 'Gestisci attività personali, organizzale in gruppi e condividile con altre persone. Installabile come app.',
  ogTitle: 'ShareToDo',
  ogDescription: 'Attività, gruppi e liste condivise in un\'app veloce e installabile.',
  ogType: 'website'
})

const { user, logout } = useAuth()
const { myShares, loadShares } = useShares()
const { todos, stats, loadTodos } = useTodos()
const { notes, loadNotes } = useNotes()
const { groups, loadGroups, migrateLegacyGroupPrefs } = useGroups()
const { status: approvalStatus, isAdmin, isApproved, loadProfile, resetProfile } = useProfile()
const { needRefresh, offlineReady, updateApp } = usePwa()
const { focusQuickAdd } = useQuickAdd()
const { open: isShareModalOpen, targetGroup: shareTarget, openShare } = useShareDialog()
const { isOnline, isSyncing, pendingCount, initSyncEngine, sync } = useSyncEngine()

onMounted(() => {
  initSyncEngine()
})

// Projects the stored preferences onto <html> (accent, density, text size) and
// keeps the browser/PWA theme colour in step with the chosen accent.
useAppearance()

// Browser notification scheduling and Push subscription syncing.
useNotifications()

// Icon badge of the installed app: how many activities are still to do. Lives in
// the shell rather than on a page so it is right whatever page you are on — and 0
// while signed out (which is what clears it).
useAppBadge(() => (user.value && isApproved.value ? stats.value.active : 0))

// iOS launch screens: what the OS paints instead of a white flash while the
// installed app boots. One <link> per device size, selected by a media query.
useHead({ link: appleSplashLinks })

const toast = useToast()

const isSettingsModalOpen = ref(false)

/* -------------------------------------------------------------- PWA notices */
watch(needRefresh, (value) => {
  if (!value) return
  toast.add({
    title: 'Nuova versione disponibile',
    description: 'Aggiorna per usare l\'ultima versione dell\'app.',
    color: 'info',
    duration: 0,
    actions: [{ label: 'Aggiorna', color: 'primary', variant: 'soft', onClick: () => updateApp() }]
  })
})

watch(offlineReady, (value) => {
  if (!value) return
  toast.add({
    title: 'Pronta per l\'uso offline',
    description: 'L\'interfaccia resta disponibile anche senza connessione.',
    color: 'neutral'
  })
})

/* --------------------------------------------------------------- workspace */
// Runs immediately with the current value and again whenever auth changes, so the
// workspace loads on sign-in and is cleared on sign-out.
watch(user, async (currentUser) => {
  if (!currentUser) {
    todos.value = []
    notes.value = []
    myShares.value = []
    groups.value = []
    resetProfile()
    isShareModalOpen.value = false
    isSettingsModalOpen.value = false
    return
  }

  // The approval flag decides whether the account may read anything at all, so it
  // is read first: every list query for a pending account would come back empty
  // anyway, and its policies are the ones that gate the rest.
  await loadProfile()

  if (isApproved.value) {
    // The tree first: the activities and notes embed their group, so loading it
    // first means the first paint of the list already has the names and the colours.
    await loadGroups()
    // Groups used to live in a per-device cookie: this hands them over once.
    await migrateLegacyGroupPrefs()
    loadTodos()
    loadNotes()
    loadShares()
    if (isOnline.value) {
      sync()
    }
  }
}, { immediate: true })
</script>

<template>
  <UApp>
    <div class="app-shell min-h-dvh text-slate-900 transition-colors dark:text-slate-100">
      <!-- Accent wash on its own fixed layer: `background-attachment: fixed` made
           the browser repaint these gradients on every scroll frame. -->
      <div class="app-glow" aria-hidden="true" />

      <AppNavbar
        :user="user"
        :collaborators-count="myShares.length"
        :is-admin="isAdmin"
        @open-share="openShare(null)"
        @open-settings="isSettingsModalOpen = true"
      />

      <!-- Offline & Sync Status Banner -->
      <div
        v-if="user && isApproved && (!isOnline || isSyncing || pendingCount > 0)"
        class="sticky top-16 z-20 border-b backdrop-blur-md transition-colors"
        :class="!isOnline
          ? 'border-amber-200/80 bg-amber-50/95 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/90 dark:text-amber-200'
          : isSyncing
            ? 'border-sky-200/80 bg-sky-50/95 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/90 dark:text-sky-200'
            : 'border-emerald-200/80 bg-emerald-50/95 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/90 dark:text-emerald-200'"
      >
        <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2 sm:px-6 text-xs font-medium">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon
              :name="!isOnline ? 'i-lucide-wifi-off' : isSyncing ? 'i-lucide-refresh-cw' : 'i-lucide-cloud-upload'"
              class="h-4 w-4 shrink-0"
              :class="{ 'animate-spin': isSyncing }"
            />
            <span class="truncate">
              <template v-if="!isOnline">
                Modalità offline — salvataggio locale attivo
                <span v-if="pendingCount > 0" class="font-bold">({{ pendingCount }} in attesa di sincronizzazione)</span>
              </template>
              <template v-else-if="isSyncing">
                Sincronizzazione con il server in corso...
              </template>
              <template v-else-if="pendingCount > 0">
                {{ pendingCount }} {{ pendingCount === 1 ? 'modifica in attesa' : 'modifiche in attesa' }} di sincronizzazione
              </template>
            </span>
          </div>

          <div v-if="isOnline && !isSyncing && pendingCount > 0" class="shrink-0">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold text-xs bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition shadow-sm"
              @click="sync()"
            >
              <UIcon name="i-lucide-refresh-cw" class="h-3 w-3" />
              <span>Sincronizza ora</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Unauthenticated: the sign-in screen -->
      <main v-if="!user" class="mx-auto max-w-3xl px-4 sm:px-6">
        <AuthView />
      </main>

      <!-- Signed in but not yet approved, or the check is still running -->
      <main v-else-if="approvalStatus !== 'approved'" class="mx-auto max-w-3xl px-4 sm:px-6">
        <AccountStatus :status="approvalStatus" />
      </main>

      <!-- Authenticated and approved: the routed pages -->
      <NuxtPage v-else />

      <!-- Shell-wide dialogs, reachable from every page -->
      <LazySettingsModal v-model:open="isSettingsModalOpen" />
      <LazyShareModal v-model:open="isShareModalOpen" :initial-group="shareTarget" />
      <AppConfirmDialog />

      <!-- Mobile Bottom Navigation Bar -->
      <MobileBottomNav
        v-if="user && isApproved"
        :is-admin="isAdmin"
        :collaborators-count="myShares.length"
        @open-share="openShare(null)"
        @open-settings="isSettingsModalOpen = true"
      />
    </div>
  </UApp>
</template>
