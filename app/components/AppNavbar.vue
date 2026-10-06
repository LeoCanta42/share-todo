<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
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
  (e: 'logout'): void
}>()

const { theme, setTheme, isDark } = useAppearance()
const { canInstall, isInstalled, needRefresh, install, updateApp } = usePwa()

const route = useRoute()

const isDarkTheme = computed(() => isDark.value)

/**
 * The app is split into routed pages, so the header carries the navigation: the
 * list of activities, the notes, and — only for an admin — the user management page.
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

const themeItems = computed<DropdownMenuItem[][]>(() => [[
  { label: 'Tema chiaro', icon: 'i-lucide-sun', type: 'checkbox', checked: theme.value === 'light', onSelect: () => setTheme('light') },
  { label: 'Tema scuro', icon: 'i-lucide-moon', type: 'checkbox', checked: theme.value === 'dark', onSelect: () => setTheme('dark') },
  { label: 'Come il sistema', icon: 'i-lucide-monitor', type: 'checkbox', checked: theme.value === 'system', onSelect: () => setTheme('system') }
]])

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = []

  groups.push([
    { label: props.user?.email ?? 'Account', type: 'label' }
  ])

  const actions: DropdownMenuItem[] = [
    { label: 'Personalizza', icon: 'i-lucide-sliders-horizontal', onSelect: () => emit('openSettings') },
    { label: 'Condividi', icon: 'i-lucide-share-2', onSelect: () => emit('openShare') },
    { label: 'Installa app', icon: 'i-lucide-download', onSelect: () => install(), disabled: !canInstall.value }
  ]

  if (props.isAdmin) {
    actions.push({ label: 'Amministrazione', icon: 'i-lucide-shield-check', onSelect: () => navigateTo('/admin') })
  }

  groups.push(actions)

  groups.push([
    { label: 'Disconnetti', icon: 'i-lucide-log-out', color: 'error', onSelect: () => emit('logout') }
  ])

  return groups
})

const userInitial = computed(() => {
  const email = props.user?.email
  if (!email) return 'U'
  return email.charAt(0).toUpperCase()
})

const collaborators = computed(() => props.collaboratorsCount ?? 0)
</script>

<template>
  <!-- Opaque, not a translucent bar with a backdrop filter: a sticky bar behind a
       filter makes the browser re-blur everything scrolling underneath it on every
       frame, which is the single most expensive thing you can put above a long list
       on a phone. A solid bar costs nothing to composite. -->
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

      <div class="flex items-center gap-1 sm:gap-1.5">
        <!-- Section navigation -->
        <nav v-if="user" class="flex items-center gap-0.5" aria-label="Sezioni">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none sm:px-2.5"
            :class="isActive(link.to)
              ? 'bg-accent-100 text-accent-800 dark:bg-accent-950/70 dark:text-accent-200'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'"
            :aria-current="isActive(link.to) ? 'page' : undefined"
            :title="link.label"
          >
            <UIcon :name="link.icon" class="h-4 w-4" />
            <span class="hidden md:inline">{{ link.label }}</span>
          </NuxtLink>
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

        <!-- Share -->
        <UButton
          v-if="user"
          variant="subtle"
          color="neutral"
          size="xs"
          icon="i-lucide-share-2"
          class="hidden rounded-xl font-medium sm:inline-flex"
          @click="emit('openShare')"
        >
          <span class="hidden sm:inline">Condividi</span>
          <span
            v-if="collaborators > 0"
            class="ml-0.5 rounded-full bg-accent-600 px-1.5 text-[10px] font-bold text-white"
          >
            {{ collaborators }}
          </span>
        </UButton>

        <!-- Settings -->
        <UButton
          v-if="user"
          variant="ghost"
          color="neutral"
          size="sm"
          icon="i-lucide-sliders-horizontal"
          class="hidden rounded-xl sm:inline-flex"
          aria-label="Personalizza l'app"
          title="Personalizza"
          @click="emit('openSettings')"
        />

        <!-- Theme -->
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

        <!-- Account menu -->
        <UDropdownMenu v-if="user" :items="menuItems" :content="{ align: 'end' }">
          <button
            type="button"
            class="ml-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700 transition-colors hover:bg-accent-200 focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:outline-none dark:bg-accent-950/70 dark:text-accent-300"
            :aria-label="`Account di ${user.email}`"
          >
            {{ userInitial }}
          </button>
        </UDropdownMenu>
      </div>
    </div>
  </header>
</template>
