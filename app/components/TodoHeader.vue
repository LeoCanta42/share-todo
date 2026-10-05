<script setup lang="ts">
import type { TodoStats } from '~/types/todo'

const props = defineProps<{
  stats: TodoStats
}>()

const formattedToday = computed(() => {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }
  const formatted = now.toLocaleDateString('it-IT', options)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
})
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 sm:p-8 text-white shadow-xl shadow-teal-900/10">
    <!-- Decorative background glow -->
    <div class="absolute -right-8 -top-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
    <div class="absolute -left-12 -bottom-12 w-48 h-48 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />

    <div class="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
      <div>
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-medium text-emerald-50 mb-3">
          <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" />
          <span>{{ formattedToday }}</span>
        </div>
        <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Le tue attività</h2>
        <p class="text-sm text-emerald-100/90 mt-1 max-w-sm">
          <span v-if="stats.total === 0">
            Nessuna attività programmata. Aggiungi il tuo primo task!
          </span>
          <span v-else-if="stats.completed === stats.total">
            🎉 Fantastico! Hai completato tutte le attività.
          </span>
          <span v-else>
            Hai completato {{ stats.completed }} su {{ stats.total }} attività ({{ stats.percentage }}%).
          </span>
        </p>
      </div>

      <!-- Quick stat cards -->
      <div class="flex items-center gap-3">
        <div class="bg-white/15 backdrop-blur-md rounded-xl p-3 px-4 text-center min-w-[76px] border border-white/10">
          <div class="text-2xl font-extrabold leading-none">{{ stats.active }}</div>
          <div class="text-[11px] font-medium text-emerald-100 uppercase tracking-wider mt-1">Da fare</div>
        </div>
        <div class="bg-white/15 backdrop-blur-md rounded-xl p-3 px-4 text-center min-w-[76px] border border-white/10">
          <div class="text-2xl font-extrabold leading-none">{{ stats.completed }}</div>
          <div class="text-[11px] font-medium text-emerald-100 uppercase tracking-wider mt-1">Fatte</div>
        </div>
      </div>
    </div>

    <!-- Progress indicator -->
    <div v-if="stats.total > 0" class="relative z-10 mt-6 pt-4 border-t border-white/15">
      <div class="flex justify-between items-center text-xs font-medium text-emerald-100 mb-1.5">
        <span>Progresso complessivo</span>
        <span>{{ stats.percentage }}%</span>
      </div>
      <div class="w-full bg-black/20 rounded-full h-2 overflow-hidden p-0.5">
        <div
          class="h-full bg-white rounded-full transition-all duration-500 ease-out"
          :style="{ width: `${stats.percentage}%` }"
        />
      </div>
    </div>
  </div>
</template>
