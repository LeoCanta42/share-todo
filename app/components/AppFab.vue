<script setup lang="ts">
/**
 * Mobile shortcut back to the quick-add bar.
 *
 * Deliberately its own component: this used to live in `app.vue`, where the scroll
 * listener set a ref that the root template rendered — so every scroll event
 * re-rendered the whole app (header, toolbar and every row). Keeping the flag
 * local means scrolling only ever touches this one button.
 */
const emit = defineEmits<{ (e: 'activate'): void }>()

const visible = ref(false)
let scheduled = false

function update() {
  scheduled = false
  const next = window.scrollY > 320
  // Only flip the ref when the threshold is actually crossed, so a long scroll
  // causes two re-renders in total rather than one per event.
  if (next !== visible.value) {
    visible.value = next
  }
}

function onScroll() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(update)
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  update()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    leave-active-class="transition duration-150 ease-in"
    enter-from-class="translate-y-4 opacity-0"
    leave-to-class="translate-y-4 opacity-0"
  >
    <button
      v-if="visible"
      type="button"
      class="fixed right-4 flex h-12 w-12 items-center justify-center rounded-2xl gradient-accent text-white shadow-lg shadow-accent-900/25 focus-visible:ring-2 focus-visible:ring-accent-500/60 focus-visible:outline-none sm:hidden"
      style="bottom: calc(1.25rem + var(--safe-bottom))"
      aria-label="Vai al campo per aggiungere un'attività"
      title="Nuova attività"
      @click="emit('activate')"
    >
      <UIcon name="i-lucide-plus" class="h-6 w-6" />
    </button>
  </Transition>
</template>
