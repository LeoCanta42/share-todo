/**
 * Short vibration for "your tap landed", on the devices that have it.
 *
 * Android/Chromium expose `navigator.vibrate`; iOS Safari never has, so there it
 * is a silent no-op — which is why no caller may depend on it for feedback that
 * matters. Chrome additionally ignores `vibrate()` unless it comes from a user
 * gesture, and every call site here is a tap handler.
 */
export function haptic(pattern: number | number[] = 10): void {
  if (!import.meta.client) return

  // Declared locally rather than read off `Navigator`: the DOM lib types the
  // parameter as `Iterable<number>` in some versions, which a plain duration is not.
  type Vibrate = (value: number | number[]) => boolean
  const vibrate = (navigator as unknown as { vibrate?: Vibrate }).vibrate
  if (typeof vibrate !== 'function') return

  try {
    vibrate.call(navigator, pattern)
  } catch {
    // Some contexts refuse to vibrate (a cross-origin frame, or a device with
    // haptics switched off) and throw instead of returning false.
  }
}
