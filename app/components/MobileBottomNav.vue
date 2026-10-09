<script setup lang="ts">
import { useQuickAdd } from '~/composables/useQuickAdd'

const props = defineProps<{
  isAdmin?: boolean
  collaboratorsCount?: number
}>()

const emit = defineEmits<{
  (e: 'openSettings'): void
  (e: 'openShare'): void
}>()

const route = useRoute()
const { focusQuickAdd } = useQuickAdd()

const isTodosActive = computed(() => route.path === '/' || route.path.startsWith('/g/'))
const isNotesActive = computed(() => route.path.startsWith('/notes'))
const isAdminActive = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <nav
    class="fixed bottom-0 inset-x-0 z-30 block sm:hidden border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] shadow-lg backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/95"
    aria-label="Navigazione principale mobile"
  >
    <div class="flex h-14 items-center justify-around px-2">
      <!-- Attività -->
      <NuxtLink
        to="/"
        class="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition"
        :class="isTodosActive
          ? 'text-accent-600 dark:text-accent-400'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
      >
        <UIcon name="i-lucide-list-checks" class="h-5 w-5" />
        <span>Attività</span>
      </NuxtLink>

      <!-- Note -->
      <NuxtLink
        to="/notes"
        class="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition"
        :class="isNotesActive
          ? 'text-accent-600 dark:text-accent-400'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
      >
        <UIcon name="i-lucide-notebook-pen" class="h-5 w-5" />
        <span>Note</span>
      </NuxtLink>

      <!-- Quick Add Center Button -->
      <div class="flex flex-1 items-center justify-center">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-2xl gradient-accent text-white shadow-md shadow-accent-600/30 transition active:scale-95"
          aria-label="Nuova attività o nota"
          title="Aggiungi"
          @click="focusQuickAdd()"
        >
          <UIcon name="i-lucide-plus" class="h-5 w-5" />
        </button>
      </div>

      <!-- Admin (if admin) -->
      <NuxtLink
        v-if="isAdmin"
        to="/admin"
        class="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold transition"
        :class="isAdminActive
          ? 'text-accent-600 dark:text-accent-400'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
      >
        <UIcon name="i-lucide-shield-check" class="h-5 w-5" />
        <span>Admin</span>
      </NuxtLink>

      <!-- Share (if not admin) -->
      <button
        v-else
        type="button"
        class="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-900 transition dark:text-slate-400 dark:hover:text-white"
        aria-label="Condividi"
        @click="emit('openShare')"
      >
        <div class="relative">
          <UIcon name="i-lucide-share-2" class="h-5 w-5" />
          <span
            v-if="collaboratorsCount && collaboratorsCount > 0"
            class="absolute -top-1 -right-2.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-600 px-1 text-[9px] font-extrabold text-white"
          >
            {{ collaboratorsCount }}
          </span>
        </div>
        <span>Condividi</span>
      </button>

      <!-- Settings -->
      <button
        type="button"
        class="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-900 transition dark:text-slate-400 dark:hover:text-white"
        aria-label="Opzioni e impostazioni"
        @click="emit('openSettings')"
      >
        <UIcon name="i-lucide-sliders-horizontal" class="h-5 w-5" />
        <span>Opzioni</span>
      </button>
    </div>
  </nav>
</template>
