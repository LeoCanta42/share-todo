<script setup lang="ts">
import { composeShareDraft, useShareTarget } from '~/composables/useShareTarget'
import { useTodos } from '~/composables/useTodos'
import { useQuickAdd } from '~/composables/useQuickAdd'

/**
 * Where content shared from another app lands.
 *
 * Android's share sheet opens `/share?title=…&text=…&url=…` (the `share_target`
 * entry in the web manifest); the `share-target` middleware stashes it, this page
 * shows it back to the user and pre-fills the composer with it. Sharing something
 * to a list app almost always means "put this on my list", so the page is a
 * confirmation — not a second app to learn: check the text, pick activity or
 * note, save.
 */
const { content, clear } = useShareTarget()
const { availableGroups } = useTodos()
const { focusSignal, focusQuickAdd } = useQuickAdd()

const draft = computed(() => composeShareDraft(content.value))
const hasLink = computed(() => Boolean(content.value?.url))

onMounted(() => {
  // Ready to be corrected: the field is focused so the keyboard is already open.
  focusQuickAdd()
})

function dismiss() {
  clear()
  navigateTo('/')
}

/**
 * The composer saved it. The payload is dropped here rather than on the next
 * visit so a re-share of the same link starts clean.
 */
function handleCreated() {
  clear()
  navigateTo('/')
}

useSeoMeta({
  title: 'Contenuto condiviso — ShareToDo',
  description: 'Controlla il contenuto ricevuto da un\'altra app e salvalo come attività o nota.'
})
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-24 sm:space-y-6 sm:px-6 sm:pt-8 sm:pb-14">
    <section class="anim-rise surface-card rounded-3xl p-4 sm:p-5" aria-label="Contenuto ricevuto">
      <div class="flex items-start gap-3">
        <span class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-400">
          <UIcon name="i-lucide-share-2" class="h-6 w-6" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
            Contenuto ricevuto
          </h2>
          <p class="todo-meta mt-0.5 text-slate-500 dark:text-slate-400">
            Da un'altra app
            <template v-if="hasLink"> · con un link</template>
          </p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-x"
          class="rounded-xl"
          aria-label="Ignora il contenuto condiviso"
          title="Ignora"
          @click="dismiss"
        />
      </div>

      <p class="mt-3 line-clamp-4 rounded-xl bg-slate-50 px-3 py-2 text-sm break-words text-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
        {{ draft || 'Nessun testo: scrivi tu cosa salvare.' }}
      </p>

      <p class="todo-meta mt-2 text-slate-400 dark:text-slate-500">
        Correggi il testo qui sotto se serve, poi salvalo come attività o come nota.
      </p>
    </section>

    <section aria-label="Salva il contenuto condiviso">
      <QuickAdd
        :groups="availableGroups"
        :focus-signal="focusSignal"
        :initial-title="draft"
        @created="handleCreated"
      />
    </section>

    <div class="flex justify-center pt-1">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-arrow-left"
        class="rounded-xl"
        @click="dismiss"
      >
        Ignora e torna alle attività
      </UButton>
    </div>
  </main>
</template>
