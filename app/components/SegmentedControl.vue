<script setup lang="ts">
export interface SegmentedOption {
  id: string
  label: string
  hint?: string
  icon?: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: SegmentedOption[]
  ariaLabel?: string
  /** Wraps onto multiple lines instead of scrolling horizontally. */
  wrap?: boolean
  size?: 'sm' | 'md'
}>(), {
  ariaLabel: 'Selezione',
  wrap: false,
  size: 'sm'
})

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function select(id: string) {
  if (id !== props.modelValue) {
    emit('update:modelValue', id)
  }
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ariaLabel"
    class="inline-flex max-w-full gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80"
    :class="wrap ? 'flex-wrap' : 'flex-nowrap overflow-x-auto scrollbar-none'"
  >
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.id"
      class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg whitespace-nowrap font-semibold transition-all focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none"
      :class="[
        size === 'md' ? 'px-3.5 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        modelValue === option.id
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900 dark:text-white dark:ring-white/10'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
      ]"
      :title="option.hint"
      @click="select(option.id)"
    >
      <UIcon v-if="option.icon" :name="option.icon" class="h-3.5 w-3.5 flex-shrink-0" />
      <span>{{ option.label }}</span>
    </button>
  </div>
</template>
