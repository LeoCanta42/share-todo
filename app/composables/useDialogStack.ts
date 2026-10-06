/**
 * Dialog stack.
 *
 * Deliberately a module-scope singleton: declaring this state inside a component's
 * `<script setup>` would run it *per instance*, so every dialog would get its own
 * private stack and its own z-index counter — which is exactly why a confirmation
 * opened from inside another dialog ended up with the same z-index and painted
 * behind it, and why the body scroll lock was released by the first dialog to close.
 *
 * Only ever called from the client (dialogs are client-side).
 */
const stack: symbol[] = []
let nextZ = 100
let lockCount = 0

/** Marker class on <html>; the rule lives in `main.css`. */
const LOCK_CLASS = 'dialog-scroll-lock'

/**
 * Body scroll lock, deliberately a marker class on <html> rather than an inline
 * `overflow: hidden` on <html>/<body>.
 *
 * `document.body.style.overflow` is shared with reka-ui (every Nuxt UI menu or
 * selector is a modal reka layer): opening one writes `overflow: hidden` inline
 * and, on release, writes back *its own snapshot* of that property. An inline
 * lock of ours could be captured by that snapshot, so closing a dialog opened
 * right after the profile menu re-applied `hidden` to <body> and left the page
 * unscrollable until a reload. A class cannot be captured or overwritten.
 */
function lockBody() {
  if (lockCount === 0) {
    document.documentElement.classList.add(LOCK_CLASS)
  }
  lockCount++
}

function unlockBody() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.documentElement.classList.remove(LOCK_CLASS)
  }
}

export function useDialogStack() {
  const id = Symbol('dialog')
  const zIndex = ref(100)

  /** Whether *this* dialog is currently contributing to the lock count. */
  let counted = false

  /** Push this dialog on top; it becomes the only one reacting to Escape/Tab. */
  function enter() {
    stack.push(id)
    zIndex.value = ++nextZ
    if (!counted) {
      counted = true
      lockBody()
    }
  }

  /** Pop this dialog and release the scroll lock if it was the last one. */
  function leave() {
    const index = stack.indexOf(id)
    if (index >= 0) stack.splice(index, 1)
    if (stack.length === 0) nextZ = 100
    // Only release what this dialog actually took: a dialog that mounts closed
    // (the watcher runs immediately) must not decrement another dialog's lock.
    if (counted) {
      counted = false
      unlockBody()
    }
  }

  function isTopMost() {
    return stack[stack.length - 1] === id
  }

  /** True while any dialog is open (used to ignore outside clicks on a parent). */
  function isOpen() {
    return stack.includes(id)
  }

  return { zIndex, enter, leave, isTopMost, isOpen }
}
