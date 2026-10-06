<script setup lang="ts">
import { useGroups } from '~/composables/useGroups'
import { useTodos } from '~/composables/useTodos'
import { useNotes } from '~/composables/useNotes'
import { groupMetaOf } from '~/utils/groups'
import type { GroupNode } from '~/types/group'

/**
 * Overview navigation: one card per top-level group, with its sub-groups listed
 * inside it and the totals of the whole branch.
 *
 * Selecting a group used to silently narrow the list you were already looking at —
 * now it takes you to a page that is *about* that group, at whatever depth, so there
 * is never a doubt about what the list in front of you contains.
 */
const { tree } = useGroups()
const { groupCounts } = useTodos()
const { noteCountsDeep } = useNotes()

function todosOf(node: GroupNode): number {
  return groupCounts.value[node.group.id]?.total.total ?? 0
}

function activeOf(node: GroupNode): number {
  return groupCounts.value[node.group.id]?.total.active ?? 0
}

function notesOf(node: GroupNode): number {
  return noteCountsDeep.value[node.group.id] ?? 0
}

const totalNotes = computed(() =>
  Object.values(noteCountsDeep.value).reduce((sum, count) => sum + count, 0)
)
</script>

<template>
  <section class="space-y-2.5" aria-label="I tuoi gruppi">
    <div class="flex items-center gap-2 px-1">
      <h2 class="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
        I tuoi gruppi
      </h2>
      <span class="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-800" />
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <NuxtLink
        v-for="node in tree"
        :key="node.group.id"
        :to="{ name: 'g-group', params: { group: [node.group.name] } }"
        class="anim-rise group flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-left transition hover:border-accent-500/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500/40"
      >
        <span
          class="flex h-9 w-9 items-center justify-center rounded-xl"
          :class="groupMetaOf(node.group).colorClass"
        >
          <UIcon :name="groupMetaOf(node.group).icon" class="h-4.5 w-4.5" />
        </span>

        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {{ node.group.name }}
          </span>
          <span class="todo-meta mt-0.5 block text-slate-400 dark:text-slate-500">
            {{ todosOf(node) }} {{ todosOf(node) === 1 ? 'attività' : 'attività' }}
            <template v-if="notesOf(node) > 0"> · {{ notesOf(node) }} note</template>
          </span>
          <span
            v-if="activeOf(node) > 0"
            class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold text-accent-700 dark:bg-accent-950/60 dark:text-accent-300"
          >
            {{ activeOf(node) }} da fare
          </span>
        </span>
      </NuxtLink>

      <!-- Notes have no group of their own, so they get their own card. -->
      <NuxtLink
        to="/notes"
        class="anim-rise group flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-left transition hover:border-accent-500/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500/40"
      >
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <UIcon name="i-lucide-notebook-pen" class="h-4.5 w-4.5" />
        </span>

        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            Tutte le note
          </span>
          <span class="todo-meta mt-0.5 block text-slate-400 dark:text-slate-500">
            {{ totalNotes }} {{ totalNotes === 1 ? 'nota' : 'note' }}
          </span>
        </span>
      </NuxtLink>
    </div>

    <!-- Sub-groups, listed under the group they belong to: the same cards, one
         level in, so a branch is reachable in a single tap without a tree control. -->
    <div v-if="tree.some(node => node.children.length)" class="space-y-2 pt-1">
      <template v-for="node in tree" :key="`children-${node.group.id}`">
        <div v-if="node.children.length" class="space-y-1.5">
          <p class="flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            <UIcon :name="groupMetaOf(node.group).icon" class="h-3.5 w-3.5" />
            {{ node.group.name }}
          </p>

          <div class="flex flex-wrap gap-1.5">
            <template v-for="child in node.children" :key="child.group.id">
              <NuxtLink
                :to="{ name: 'g-group', params: { group: [node.group.name, child.group.name] } }"
                class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-accent-500/50 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <UIcon :name="groupMetaOf(child.group).icon" class="h-3.5 w-3.5 opacity-80" />
                <span>{{ child.group.name }}</span>
                <span class="text-slate-400 dark:text-slate-500">{{ todosOf(child) }}</span>
              </NuxtLink>

              <!-- third level: shown as its own chip group -->
              <NuxtLink
                v-for="grandChild in child.children"
                :key="grandChild.group.id"
                :to="{ name: 'g-group', params: { group: [node.group.name, child.group.name, grandChild.group.name] } }"
                class="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-200/80 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-accent-500/50 hover:shadow-sm dark:border-slate-800 dark:text-slate-400"
              >
                <UIcon :name="groupMetaOf(grandChild.group).icon" class="h-3.5 w-3.5 opacity-70" />
                <span>{{ grandChild.group.name }}</span>
                <span class="text-slate-400 dark:text-slate-500">{{ todosOf(grandChild) }}</span>
              </NuxtLink>
            </template>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
