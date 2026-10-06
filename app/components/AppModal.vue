<script setup lang="ts">
/**
 * Shared dialog shell.
 *
 * Fixes the issues the hand-rolled overlays had: Escape / backdrop close, body
 * scroll locking (with a lock counter so stacked dialogs behave), focus moved
 * into the panel on open and restored on close, a Tab trap, `role="dialog"` and
 * a bottom-sheet layout on phones.
 */
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  subtitle?: string
  icon?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Clicking the backdrop / pressing Escape closes the dialog. */
  dismissible?: boolean
  /** Hide the header close button (e.g. when a footer action is the only exit). */
  hideClose?: boolean
  /** Keep the panel flush to the viewport edge on mobile (long readers). */
  fullHeight?: boolean
}>(), {
  size: 'md',
  dismissible: true,
  hideClose: false,
  fullHeight: false
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'close'): void
}>()

const panelRef = ref<HTMLElement | null>(null)
const titleId = useId()

/**
 * Stacking, the body scroll lock and "who owns Escape" all come from a
 * module-scope singleton (see `useDialogStack`): a dialog opened from inside
 * another one must paint above it, and only the top-most one may react to
 * Escape/Tab.
 */
const { zIndex, enter, leave, isTopMost } = useDialogStack()

const sizeClass = computed(() => ({
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl'
}[props.size]))

function close() {
  if (!props.dismissible) return
  emit('update:open', false)
  emit('close')
}

function onBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

function focusable(): HTMLElement[] {
  const panel = panelRef.value
  if (!panel) return []
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null || el === document.activeElement)
}

function onKeydown(event: KeyboardEvent) {
  // Escape and Tab belong to the dialog on top: without this, one Escape would
  // close both the confirmation and the dialog underneath it.
  if (!isTopMost()) return

  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return

  const items = focusable()
  if (items.length === 0) {
    event.preventDefault()
    panelRef.value?.focus()
    return
  }

  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement as HTMLElement | null

  if (event.shiftKey && (active === first || active === panelRef.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.open, async (open) => {
  if (!import.meta.client) return

  if (open) {
    enter()
    window.addEventListener('keydown', onKeydown, true)
    await nextTick()
    const items = focusable()
    if (items.length > 0) {
      // Prefer the first non-close control so screen readers land on content.
      const target = items.find(el => !el.hasAttribute('data-modal-close')) ?? items[0]
      target?.focus()
    } else {
      panelRef.value?.focus()
    }
  } else {
    leave()
    window.removeEventListener('keydown', onKeydown, true)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (!import.meta.client) return
  // Unmounting while still open (e.g. a `v-if` on the parent) must release the slot.
  if (props.open) leave()
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4"
        :style="{ zIndex }"
        role="presentation"
        @click="onBackdrop"
      >
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          :aria-label="title ? undefined : 'Finestra di dialogo'"
          tabindex="-1"
          class="anim-modal surface-card relative flex w-full flex-col overflow-hidden rounded-t-3xl border-slate-200/80 shadow-2xl outline-none sm:rounded-3xl dark:border-slate-800"
          :class="[
            sizeClass,
            fullHeight ? 'max-h-[92dvh] sm:max-h-[85dvh]' : 'max-h-[90dvh]'
          ]"
        >
          <!-- Bottom-sheet grabber (phones only) -->
          <div class="flex justify-center pt-2.5 sm:hidden">
            <span class="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
          </div>

          <header
            v-if="title || $slots.header || !hideClose"
            class="flex items-start gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-5"
          >
            <div
              v-if="icon"
              class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700 dark:bg-accent-950/70 dark:text-accent-300"
            >
              <UIcon :name="icon" class="h-4.5 w-4.5" />
            </div>

            <div class="min-w-0 flex-1">
              <h2 v-if="title" :id="titleId" class="text-base font-bold text-slate-900 dark:text-white">
                {{ title }}
              </h2>
              <p v-if="subtitle" class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {{ subtitle }}
              </p>
              <slot name="header" />
            </div>

            <slot name="header-actions" />

            <button
              v-if="!hideClose"
              type="button"
              data-modal-close
              class="ml-auto -mr-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-200"
              :aria-label="'Chiudi'"
              @click="close"
            >
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
            <slot />
          </div>

          <footer
            v-if="$slots.footer"
            class="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 pb-safe sm:px-6 dark:border-slate-800 dark:bg-slate-900/50"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
