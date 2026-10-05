<script setup lang="ts">
import { useConfirm } from '~/composables/useConfirm'

/** Single host for every confirmation dialog in the app. */
const { state, answer } = useConfirm()

const tone = computed(() => state.value.options?.tone ?? 'danger')
</script>

<template>
  <AppModal
    :open="state.open"
    size="sm"
    :icon="state.options?.icon ?? 'i-lucide-alert-triangle'"
    :title="state.options?.title"
    :subtitle="state.options?.description"
    @update:open="(value) => { if (!value) answer(false) }"
  >
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <UButton
        color="neutral"
        variant="soft"
        size="md"
        class="justify-center rounded-xl"
        @click="answer(false)"
      >
        {{ state.options?.cancelLabel ?? 'Annulla' }}
      </UButton>
      <UButton
        :color="tone === 'danger' ? 'error' : 'primary'"
        size="md"
        class="justify-center rounded-xl font-semibold"
        @click="answer(true)"
      >
        {{ state.options?.confirmLabel ?? 'Conferma' }}
      </UButton>
    </div>
  </AppModal>
</template>
