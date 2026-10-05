<script setup lang="ts">
import { getGroupMeta, DEFAULT_GROUPS } from '~/utils/groups'

const props = defineProps<{
  loading?: boolean
  availableGroups: string[]
  defaultGroup?: string
}>()

const emit = defineEmits<{
  (e: 'add', title: string, group: string): void
}>()

const inputTitle = ref('')
const selectedGroup = ref(props.defaultGroup || 'Generale')
const isPickerOpen = ref(false)
const customGroupInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.defaultGroup, (newVal) => {
  if (newVal && newVal !== 'all') {
    selectedGroup.value = newVal
  }
})

const activeGroupMeta = computed(() => getGroupMeta(selectedGroup.value))

function selectGroup(name: string) {
  selectedGroup.value = name
  isPickerOpen.value = false
  inputRef.value?.focus()
}

function handleAddCustomGroup() {
  const trimmed = customGroupInput.value.trim()
  if (trimmed) {
    selectedGroup.value = trimmed
    customGroupInput.value = ''
    isPickerOpen.value = false
    inputRef.value?.focus()
  }
}

function handleSubmit() {
  const trimmed = inputTitle.value.trim()
  if (!trimmed || props.loading) return

  emit('add', trimmed, selectedGroup.value)
  inputTitle.value = ''
}
</script>

<template>
  <div class="space-y-2">
    <form
      class="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500 transition-all"
      @submit.prevent="handleSubmit"
    >
      <!-- Main text input -->
      <div class="flex items-center gap-2 flex-1 px-2">
        <div class="pointer-events-none text-gray-400 dark:text-gray-500 flex-shrink-0">
          <UIcon name="i-lucide-circle-plus" class="w-5 h-5" />
        </div>

        <input
          ref="inputRef"
          v-model="inputTitle"
          type="text"
          placeholder="Cosa devi fare? (es. Revisione budget, Compra il latte...)"
          class="w-full bg-transparent border-0 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-0"
          :disabled="loading"
        >
      </div>

      <!-- Controls: Group selector & Submit -->
      <div class="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-800/60 px-2 sm:px-0">
        <!-- Subgroup Dropdown Trigger -->
        <div class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            :class="[
              activeGroupMeta.colorClass,
              'border-transparent hover:opacity-90 shadow-xs'
            ]"
            @click="isPickerOpen = !isPickerOpen"
          >
            <UIcon :name="activeGroupMeta.icon" class="w-3.5 h-3.5" />
            <span>{{ selectedGroup }}</span>
            <UIcon name="i-lucide-chevron-down" class="w-3 h-3 opacity-60 ml-0.5" />
          </button>

          <!-- Group Popover / Dropdown Menu -->
          <div
            v-if="isPickerOpen"
            class="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-64 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl z-50 space-y-3 animate-in fade-in zoom-in-95 duration-100"
          >
            <div>
              <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                Scegli sottogruppo
              </div>
              <div class="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-0.5">
                <button
                  v-for="grp in availableGroups"
                  :key="grp"
                  type="button"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                  :class="[
                    selectedGroup === grp
                      ? 'ring-2 ring-emerald-500 border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60'
                  ]"
                  @click="selectGroup(grp)"
                >
                  <UIcon :name="getGroupMeta(grp).icon" class="w-3 h-3" />
                  <span>{{ grp }}</span>
                </button>
              </div>
            </div>

            <!-- Custom subgroup input -->
            <div class="pt-2 border-t border-gray-100 dark:border-gray-800">
              <div class="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Nuovo sottogruppo
              </div>
              <div class="flex gap-1.5">
                <input
                  v-model="customGroupInput"
                  type="text"
                  placeholder="Nome gruppo..."
                  class="flex-1 px-2.5 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  @keydown.enter.prevent="handleAddCustomGroup"
                >
                <UButton
                  size="xs"
                  color="neutral"
                  :disabled="!customGroupInput.trim()"
                  @click="handleAddCustomGroup"
                >
                  Usa
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <UButton
          type="submit"
          color="primary"
          size="md"
          :loading="loading"
          :disabled="!inputTitle.trim() || loading"
          icon="i-lucide-plus"
          class="rounded-xl transition-transform active:scale-95"
        >
          Aggiungi
        </UButton>
      </div>
    </form>
  </div>
</template>
