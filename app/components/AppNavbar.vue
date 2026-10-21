<script setup lang="ts">
import { useAppearance } from '~/composables/useAppearance'
import { usePwa } from '~/composables/usePwa'

const props = defineProps<{
  user?: { email?: string } | null
  collaboratorsCount?: number
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  (e: 'openShare'): void
  (e: 'openSettings'): void
}>()

const { setTheme, isDark } = useAppearance()
const { canInstall, isInstalled, needRefresh, install, updateApp } = usePwa()

const route = useRoute()

const isDarkTheme = computed(() => isDark.value)

/**
 * Header navigation: Activities, Notes, and Admin (for administrators).
 */
const links = computed(() => {
  const items = [
    { label: 'Attività', to: '/', icon: 'i-lucide-list-checks' },
    { label: 'Note', to: '/notes', icon: 'i-lucide-notebook-pen' }
  ]

  if (props.isAdmin) {
    items.push({ label: 'Admin', to: '/admin', icon: 'i-lucide-shield-check' })
  }

  return items
})

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

const displayName = computed(() => {
  const email = props.user?.email
  if (!email) return 'Profilo'
  return email.split('@')[0] ?? 'Profilo'
})

const userInitial = computed(() => {
  const email = props.user?.email
  if (!email) return 'U'
  return email.charAt(0).toUpperCase()
})

const collaborators = computed(() => props.collaboratorsCount ?? 0)
</script>

<template>
  <header class="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white pt-safe dark:border-slate-800/80 dark:bg-slate-950">
    <div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-2 px-4 sm:px-6">
      <!-- Brand -->
      <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5" aria-label="ShareToDo — vai alla panoramica">
        <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl gradient-accent text-white shadow-md shadow-accent-600/25">
          <UIcon name="i-lucide-check" class="h-5 w-5" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-base leading-none font-bold text-slate-900 sm:text-lg dark:text-white">
            ShareToDo
          </h1>
          <p class="mt-0.5 hidden text-xs text-slate-500 sm:block dark:text-slate-400">
            Attività e condivisione
          </p>
        </div>
      </NuxtLink>

      <div class="flex items-center gap-1 sm:gap-2">
        <!-- Section navigation (desktop / tablet) -->
        <nav v-if="user" class="hidden sm:flex items-center gap-1" aria-label="Sezioni">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
            :class="isActive(link.to)
              ? 'bg-accent-100 text-accent-800 dark:bg-accent-950/70 dark:text-accent-200'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'"
            :aria-current="isActive(link.to) ? 'page' : undefined"
            :title="link.label"
          >
            <UIcon :name="link.icon" class="h-4 w-4" />
            <span>{{ link.label }}</span>
          </NuxtLink>

          <!-- Share button in desktop navigation -->
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Condividi"
            @click="emit('openShare')"
          >
            <UIcon name="i-lucide-share-2" class="h-4 w-4" />
            <span>Condividi</span>
            <span
              v-if="collaborators > 0"
              class="ml-0.5 rounded-full bg-accent-600 px-1.5 text-[10px] font-bold text-white"
            >
              {{ collaborators }}
            </span>
          </button>
        </nav>

        <!-- New version available -->
        <UButton
          v-if="needRefresh"
          color="primary"
          variant="soft"
          size="xs"
          icon="i-lucide-refresh-cw"
          class="rounded-xl font-semibold"
          @click="updateApp"
        >
          <span class="hidden sm:inline">Aggiorna</span>
        </UButton>

        <!-- Install (only when the browser offered a prompt) -->
        <UButton
          v-if="canInstall && !isInstalled"
          color="primary"
          variant="subtle"
          size="xs"
          icon="i-lucide-download"
          class="rounded-xl font-medium"
          title="Installa l'app sul dispositivo"
          @click="install"
        >
          <span class="hidden sm:inline">Installa</span>
        </UButton>

        <!-- Theme Toggle -->
        <ClientOnly>
          <UButton
            :icon="isDarkTheme ? 'i-lucide-moon' : 'i-lucide-sun'"
            color="neutral"
            variant="ghost"
            size="sm"
            class="rounded-xl"
            :aria-label="isDarkTheme ? 'Attiva tema chiaro' : 'Attiva tema scuro'"
            :title="isDarkTheme ? 'Tema chiaro' : 'Tema scuro'"
            @click="setTheme(isDarkTheme ? 'light' : 'dark')"
          />
          <template #fallback>
            <div class="h-8 w-8" />
          </template>
        </ClientOnly>

        <!-- User Profile Button (opens Settings) -->
        <button
          v-if="user"
          type="button"
          class="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 p-1 pr-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          title="Opzioni e account"
          aria-label="Opzioni e account"
          @click="emit('openSettings')"
        >
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-100 text-xs font-bold text-accent-700 dark:bg-accent-950 dark:text-accent-300">
            {{ userInitial }}
          </div>
          <span class="max-w-[120px] truncate hidden sm:inline">{{ displayName }}</span>
          <UIcon name="i-lucide-settings" class="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>
    </div>
  </header>
</template>
