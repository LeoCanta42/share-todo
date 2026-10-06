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

  const vibrate = (navigator as Navigator & { vibrate?: (value: number | number[]) => boolean }).vibrate
  if (typeof vibrate !== 'function') return

  try {
    vibrate.call(navigator, pattern)
  } catch {
    // Some contexts refuse to vibrate (a cross-origin frame, or a device with
    // haptics switched off) and throw instead of returning false.
  }
}
