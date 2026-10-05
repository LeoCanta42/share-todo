<script setup lang="ts">
const props = defineProps<{
  user?: any
  collaboratorsCount?: number
}>()

const emit = defineEmits<{
  (e: 'openShare'): void
  (e: 'logout'): void
}>()

const colorMode = useColorMode()

const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (val: boolean) => {
    colorMode.preference = val ? 'dark' : 'light'
  }
})

function toggleColorMode() {
  isDark.value = !isDark.value
}

const userInitial = computed(() => {
  if (!props.user?.email) return 'U'
  return props.user.email.charAt(0).toUpperCase()
})
</script>

<template>
  <header class="w-full border-b border-gray-200/80 dark:border-gray-800/80 backdrop-blur-md bg-white/75 dark:bg-gray-900/75 sticky top-0 z-30 transition-colors">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <!-- Logo & App name -->
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
          <UIcon name="i-lucide-check-check" class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="font-bold text-lg leading-none text-gray-900 dark:text-white flex items-center gap-2">
            Nuxt Todo
            <UBadge variant="subtle" size="xs" color="primary">RLS</UBadge>
          </h1>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Attività e condivisione</p>
        </div>
      </div>

      <!-- Right actions -->
      <div class="flex items-center gap-2">
        <!-- Share button (when authenticated) -->
        <UButton
          v-if="user"
          variant="subtle"
          color="neutral"
          size="xs"
          icon="i-lucide-share-2"
          class="rounded-xl font-medium"
          @click="emit('openShare')"
        >
          <span class="hidden sm:inline">Condividi</span>
          <span v-if="collaboratorsCount && collaboratorsCount > 0" class="ml-0.5 px-1.5 py-0.2 bg-emerald-500 text-white rounded-full text-[10px]">
            {{ collaboratorsCount }}
          </span>
        </UButton>

        <!-- Dark / Light theme toggle -->
        <ClientOnly>
          <UButton
            :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="isDark ? 'Attiva tema chiaro' : 'Attiva tema scuro'"
            @click="toggleColorMode"
          />
          <template #fallback>
            <div class="w-8 h-8" />
          </template>
        </ClientOnly>

        <!-- User profile & Logout (when authenticated) -->
        <div v-if="user" class="flex items-center gap-1.5 pl-2 border-l border-gray-200 dark:border-gray-800">
          <div
            class="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold"
            :title="user.email"
          >
            {{ userInitial }}
          </div>

          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-log-out"
            title="Disconnetti"
            aria-label="Disconnetti"
            class="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
            @click="emit('logout')"
          />
        </div>
      </div>
    </div>
  </header>
</template>
