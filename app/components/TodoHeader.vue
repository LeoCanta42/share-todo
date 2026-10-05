<script setup lang="ts">
import type { TodoStats } from '~/types/todo'

/** Hero card: greeting, day, progress ring and the three counters. */
const props = defineProps<{
  stats: TodoStats
  userEmail?: string | null
}>()

const formattedToday = computed(() => {
  const now = new Date()
  const formatted = now.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return 'Buonanotte'
  if (hour < 13) return 'Buongiorno'
  if (hour < 18) return 'Buon pomeriggio'
  return 'Buonasera'
})

const displayName = computed(() => {
  const email = props.userEmail
  if (!email) return null
  const raw = email.split('@')[0] ?? ''
  if (!raw) return null
  const cleaned = raw.replace(/[._-]+/g, ' ').trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
})

const summary = computed(() => {
  if (props.stats.total === 0) return 'Nessuna attività programmata: aggiungi la prima.'
  if (props.stats.completed === props.stats.total) return 'Hai completato tutte le attività.'
  return `${props.stats.completed} di ${props.stats.total} completate · ${props.stats.active} da fare`
})

// Progress ring geometry (r=26 → circumference ≈ 163.4)
const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const dashOffset = computed(() => CIRCUMFERENCE * (1 - props.stats.percentage / 100))
</script>

<template>
  <section class="anim-rise relative overflow-hidden rounded-3xl gradient-accent-strong p-5 text-white shadow-xl shadow-accent-950/20 sm:p-7">
    <!-- Decorative glows -->
    <div class="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
    <div class="pointer-events-none absolute -bottom-14 -left-10 h-52 w-52 rounded-full bg-accent-300/25 blur-3xl" />

    <div class="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
          <UIcon name="i-lucide-calendar" class="h-3.5 w-3.5" />
          <span>{{ formattedToday }}</span>
        </div>

        <h2 class="text-xl font-bold tracking-tight sm:text-2xl">
          {{ greeting }}<span v-if="displayName">, {{ displayName }}</span>
        </h2>
        <p class="mt-1 max-w-sm text-sm text-white/80">
          {{ summary }}
        </p>
      </div>

      <div class="flex items-center gap-4">
        <!-- Progress ring -->
        <div class="relative h-[68px] w-[68px] flex-shrink-0">
          <svg viewBox="0 0 64 64" class="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" :r="RADIUS" fill="none" stroke="currentColor" stroke-width="6" class="text-white/20" />
            <circle
              cx="32"
              cy="32"
              :r="RADIUS"
              fill="none"
              stroke="currentColor"
              stroke-width="6"
              stroke-linecap="round"
              class="text-white transition-all duration-700 ease-out"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="dashOffset"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-base font-extrabold leading-none">{{ stats.percentage }}%</span>
            <span class="text-[9px] font-medium tracking-wider text-white/70 uppercase">fatto</span>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <div class="min-w-[68px] rounded-2xl border border-white/10 bg-white/15 px-3 py-2.5 text-center backdrop-blur-md">
            <div class="text-xl font-extrabold leading-none">{{ stats.active }}</div>
            <div class="mt-1 text-[10px] font-medium tracking-wider text-white/80 uppercase">Da fare</div>
          </div>
          <div class="min-w-[68px] rounded-2xl border border-white/10 bg-white/15 px-3 py-2.5 text-center backdrop-blur-md">
            <div class="text-xl font-extrabold leading-none">{{ stats.completed }}</div>
            <div class="mt-1 text-[10px] font-medium tracking-wider text-white/80 uppercase">Fatte</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
