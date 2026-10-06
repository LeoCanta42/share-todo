import { createPreferencesStore } from '~/composables/usePreferences'

/**
 * The app's single preferences store, injected as `$preferences`.
 *
 * A plugin is the place for it because a plugin runs exactly once per app
 * instance — while anything created inside `<script setup>` runs once *per
 * component instance*. `usePreferences()` used to create the cookie itself, so
 * every activity row (through `TodoItem`) paid for its own cookie ref: one
 * `BroadcastChannel`, one deep watcher and one deep clone of the preferences
 * per row. Here it is created once, before any component exists, and on the
 * server once per request (the cookie is still read during SSR, so `data-accent`
 * and friends are right on the first paint).
 */
export default defineNuxtPlugin(() => {
  return {
    provide: {
      preferences: createPreferencesStore()
    }
  }
})
