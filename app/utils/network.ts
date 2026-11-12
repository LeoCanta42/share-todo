export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true
  }
  if (!error) return false
  const errStr = String((error as any)?.message || error).toLowerCase()
  return (
    errStr.includes('failed to fetch') ||
    errStr.includes('networkerror') ||
    errStr.includes('network request failed') ||
    errStr.includes('load failed') ||
    errStr.includes('err_internet_disconnected') ||
    errStr.includes('err_network_changed') ||
    errStr.includes('fetch failed') ||
    errStr.includes('abort') ||
    errStr.includes('connection refused') ||
    errStr.includes('offline')
  )
}
