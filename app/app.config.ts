export default defineAppConfig({
  ui: {
    // Emerald is the default accent. The runtime accent switch in
    // `usePreferences()` remaps `--accent-*` (and `--ui-color-primary-*` through
    // it), so these values stay coherent with whatever accent is selected.
    colors: {
      primary: 'emerald',
      neutral: 'slate'
    }
  }
})
