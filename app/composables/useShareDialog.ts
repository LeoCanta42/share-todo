/**
 * The sharing dialog, opened from several places.
 *
 * Lives in shared state instead of in `app.vue` because a page can open it too —
 * the group page's "share this group" button needs to hand the dialog a group to
 * preselect, which a plain event up to the shell could not express.
 */
export function useShareDialog() {
  const open = useState<boolean>('share-modal-open', () => false)
  /** Group to preselect; null means "the whole list". */
  const targetGroup = useState<string | null>('share-modal-group', () => null)

  function openShare(group: string | null = null) {
    targetGroup.value = group
    open.value = true
  }

  return { open, targetGroup, openShare }
}
