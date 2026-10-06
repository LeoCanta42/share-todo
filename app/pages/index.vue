<script setup lang="ts">
import { useTodos } from '~/composables/useTodos'
import { useCurrentUser } from '~/composables/useCurrentUser'
import { useQuickAdd } from '~/composables/useQuickAdd'

/**
 * Overview: greeting and progress, your groups, then the full list of activities.
 *
 * The list here always covers everything. Narrowing to one group is no longer a
 * filter hidden in the toolbar but a page of its own (`/g/:group`), which is why
 * `selectedGroup` is pushed back to "all" on entry — including when the user comes
 * back from a group page with the browser's Back button.
 */
const route = useRoute()

const { userEmail } = useCurrentUser()
const { stats, selectedGroupId } = useTodos()
const { focusQuickAdd } = useQuickAdd()

selectedGroupId.value = 'all'

onMounted(() => {
  // Manifest shortcut: /?focus=new focuses the quick-add field. Handled here rather
  // than in the shell because this is the page that actually renders it.
  if (route.query.focus === 'new') {
    focusQuickAdd()
  }
})
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-24 sm:space-y-6 sm:px-6 sm:pt-8 sm:pb-14">
    <TodoHeader :stats="stats" :user-email="userEmail" />

    <GroupsGrid />

    <WorkspaceView />

    <footer class="space-y-1 pt-6 text-center text-xs text-slate-400 dark:text-slate-500">
      <p>Organizza le tue attività in gruppi e condividile in tempo reale.</p>
    </footer>
  </main>
</template>
