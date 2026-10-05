<script setup lang="ts">
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
</script>

<template>
  <header class="w-full border-b border-gray-200/80 dark:border-gray-800/80 backdrop-blur-md bg-white/75 dark:bg-gray-900/75 sticky top-0 z-30 transition-colors">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
          <UIcon name="i-lucide-check-check" class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="font-bold text-lg leading-none text-gray-900 dark:text-white flex items-center gap-2">
            Nuxt Todo
            <UBadge variant="subtle" size="xs" color="primary">Supabase</UBadge>
          </h1>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Gestione attività moderna</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
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
      </div>
    </div>
  </header>
</template>
