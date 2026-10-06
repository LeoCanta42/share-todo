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
let previousOverflow = ''

function lockBody() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
  lockCount++
}

function unlockBody() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow
    document.documentElement.style.overflow = ''
  }
}

export function useDialogStack() {
  const id = Symbol('dialog')
  const zIndex = ref(100)

  /** Push this dialog on top; it becomes the only one reacting to Escape/Tab. */
  function enter() {
    stack.push(id)
    zIndex.value = ++nextZ
    lockBody()
  }

  /** Pop this dialog and release the scroll lock if it was the last one. */
  function leave() {
    const index = stack.indexOf(id)
    if (index >= 0) stack.splice(index, 1)
    if (stack.length === 0) nextZ = 100
    unlockBody()
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
