<script setup lang="ts">
import type { GroupNode } from '~/types/group'

/**
 * Pick a group out of the tree.
 *
 * A native `<select>` on purpose: on a phone it opens the OS picker, which is faster
 * to reach with a thumb and works with a screen reader for free — the thing this
 * replaced (a popup list with a search field) was a desktop idea. Nesting is shown by
 * indenting the label, since an `<option>` cannot carry markup.
 */
const props = withDefaults(defineProps<{
  modelValue: string | null
  /** The tree to choose from, as `useGroups().tree` returns it. */
  tree: GroupNode[]
  /** Offer "the whole list" (a null value): the whole-list grant. */
  allowWholeList?: boolean
  wholeListLabel?: string
  disabled?: boolean
  ariaLabel?: string
}>(), {
  allowWholeList: false,
  wholeListLabel: 'Tutta la lista',
  disabled: false,
  ariaLabel: 'Gruppo'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

interface Option {
  id: string
  label: string
}

/** Depth-first, parents before children, indented by one dash per level. */
const options = computed<Option[]>(() => {
  const list: Option[] = []

  if (props.allowWholeList) {
    list.push({ id: '', label: props.wholeListLabel })
  }

  const walk = (nodes: GroupNode[]) => {
    for (const node of nodes) {
      const indent = '—'.repeat(Math.max(0, node.depth - 1))
      list.push({
        id: node.group.id,
        label: `${indent ? `${indent} ` : ''}${node.group.name}`
      })
      walk(node.children)
    }
  }
  walk(props.tree)

  return list
})

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value || null)
}
</script>

<template>
  <select
    :value="modelValue ?? ''"
    :disabled="disabled"
    :aria-label="ariaLabel"
    class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    @change="onChange"
  >
    <option v-for="option in options" :key="option.id" :value="option.id">
      {{ option.label }}
    </option>
  </select>
</template>
