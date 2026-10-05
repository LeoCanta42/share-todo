<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useAppearance } from '~/composables/useAppearance'
import { usePwa } from '~/composables/usePwa'

const props = defineProps<{
  user?: { email?: string } | null
  collaboratorsCount?: number
}>()

const emit = defineEmits<{
  (e: 'openShare'): void
  (e: 'openSettings'): void
  (e: 'logout'): void
}>()

const { theme, setTheme, isDark } = useAppearance()
const { canInstall, isInstalled, needRefresh, install, updateApp } = usePwa()

const isDarkTheme = computed(() => isDark.value)

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

  groups.push([
    { label: 'Personalizza', icon: 'i-lucide-sliders-horizontal', onSelect: () => emit('openSettings') },
    { label: 'Condividi', icon: 'i-lucide-share-2', onSelect: () => emit('openShare') },
    { label: 'Installa app', icon: 'i-lucide-download', onSelect: () => install(), disabled: !canInstall.value }
  ])

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
  <header class="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-sm transition-colors pt-safe dark:border-slate-800/80 dark:bg-slate-950/90">
    <div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-2 px-4 sm:px-6">
      <!-- Brand -->
      <div class="flex min-w-0 items-center gap-2.5">
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
      </div>

      <div class="flex items-center gap-1 sm:gap-1.5">
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
