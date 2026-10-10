import type { Database } from '~/types/database.types'
import { dueLabel } from '~/utils/date'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const cleanStr = (base64String || '').trim()
  const padding = '='.repeat((4 - (cleanStr.length % 4)) % 4)
  const base64 = (cleanStr + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * What the `send-reminders` function reports back about a test push: how many
 * devices the account has registered, how many pushes the push services took,
 * which devices were refused and why.
 */
type PushDeliverySummary = {
  message?: string
  scheduled?: boolean
  subscriptions?: number
  sent?: number
  failures?: Array<{ status: number | null, reason: string }>
}

/** Outcome of registering *this* device with the push service and the database. */
type PushRegistration = {
  ok: boolean
  reason?: string
}

/** A device the server would push to for this account. */
type RegisteredPushDevice = {
  id: number
  endpointHost: string
  platform: string
  createdAt: string | null
  lastSeenAt: string | null
}

/** One push this device actually received, as recorded by the service worker. */
type PushReceipt = {
  at: string
  title?: string
  tag?: string
  sentAt?: number | null
  lateByMs?: number | null
  shown?: boolean
  error?: string | null
}

export function useNotifications() {
  const toast = useToast()
  const config = useRuntimeConfig()
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const { todos } = useTodos()

  const permission = useState<'default' | 'granted' | 'denied' | 'unsupported'>('notifications-permission', () => 'default')
  const isSubscribing = ref(false)
  const notifiedIds = useState<number[]>('notified-reminder-ids', () => [])

  const isSupported = computed(() => {
    if (!import.meta.client) return false
    return 'Notification' in window
  })

  function refreshPermission() {
    if (!import.meta.client) return
    if (!('Notification' in window)) {
      permission.value = 'unsupported'
    } else {
      permission.value = Notification.permission
    }
  }

  async function requestPermission(): Promise<boolean> {
    if (!import.meta.client) return false
    if (!('Notification' in window)) {
      permission.value = 'unsupported'
      toast.add({
        title: 'Notifiche non supportate',
        description: 'Questo browser o dispositivo non supporta le notifiche web.',
        color: 'warning'
      })
      return false
    }

    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result === 'granted') {
        toast.add({
          title: 'Notifiche attivate',
          description: 'Riceverai i promemoria impostati per le tue attività.',
          color: 'success'
        })
        await subscribePush()
        return true
      } else if (result === 'denied') {
        toast.add({
          title: 'Notifiche bloccate',
          description: 'Le notifiche sono state bloccate nelle impostazioni del browser.',
          color: 'error'
        })
        return false
      }
      return false
    } catch (err: unknown) {
      console.error('Error requesting notification permission:', err)
      return false
    }
  }

  /**
   * Deletes one subscription row. PostgREST builders are only *thenable* (they
   * implement `then`, not `catch`), so errors have to be handled with try/catch.
   */
  async function deleteSubscriptionByEndpoint(endpoint: string) {
    try {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) console.warn('[useNotifications] could not delete stale subscription:', error.message)
    } catch (err: unknown) {
      console.warn('[useNotifications] could not delete stale subscription:', err)
    }
  }

  async function subscribePush(): Promise<PushRegistration> {
    if (!import.meta.client || !('serviceWorker' in navigator)) {
      return { ok: false, reason: 'Questo browser non supporta i service worker.' }
    }
    if (!userId.value) {
      return { ok: false, reason: 'Devi effettuare l\'accesso.' }
    }

    const vapidKey = (config.public.vapidPublicKey || '').trim()
    if (!vapidKey) {
      const reason = 'Chiave pubblica VAPID non configurata (NUXT_PUBLIC_VAPID_PUBLIC_KEY).'
      console.warn(`[useNotifications] ${reason}`)
      return { ok: false, reason }
    }

    isSubscribing.value = true
    try {
      // 1. Get registration (immediate check, then ready)
      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg?.active) {
        reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 5000))
        ])
      }
      if (!reg || !('pushManager' in reg)) {
        return { ok: false, reason: 'Service worker o PushManager non pronti: riapri l\'app e riprova.' }
      }

      // Proactively trigger service worker update so mobile devices install the latest sw.js immediately
      reg.update().catch(() => {})

      let sub = await reg.pushManager.getSubscription()

      // Validate existing subscription key against target VAPID key
      if (sub && sub.options?.applicationServerKey) {
        const currentKey = new Uint8Array(sub.options.applicationServerKey)
        const targetKey = urlBase64ToUint8Array(vapidKey)
        let keyMatches = currentKey.length === targetKey.length
        if (keyMatches) {
          for (let i = 0; i < currentKey.length; i++) {
            if (currentKey[i] !== targetKey[i]) {
              keyMatches = false
              break
            }
          }
        }
        if (!keyMatches) {
          console.info('[push] Renewing push subscription due to VAPID key mismatch')
          await sub.unsubscribe().catch(() => {})
          sub = null
        }
      }

      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
          })
        } catch (subErr) {
          console.warn('Push subscription failed, trying unregister and re-subscribe:', subErr)
          const existing = await reg.pushManager.getSubscription()
          if (existing) {
            await existing.unsubscribe().catch(() => {})
          }
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
          })
        }
      }

      if (!sub) {
        return { ok: false, reason: 'Il browser non ha creato una sottoscrizione push.' }
      }

      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, reason: 'Dati di sottoscrizione incompleti dal browser.' }
      }

      // `user_id` is what the server filters on, so it has to be the auth user id
      // (`sub` in the JWT claims) — `useSupabaseUser().id` does not exist.
      const record = {
        user_id: userId.value,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString()
      }

      const { error } = await supabase.from('push_subscriptions').upsert(record, { onConflict: 'endpoint' })
      if (!error) return { ok: true }

      // The endpoint may be left behind by an earlier install, in which case the
      // update is refused: clear it and insert cleanly instead.
      console.warn('[useNotifications] upsert of the push subscription failed, retrying with a clean insert:', error.message)
      await deleteSubscriptionByEndpoint(json.endpoint)

      const { error: insertError } = await supabase.from('push_subscriptions').insert(record)
      if (insertError) {
        console.error('[useNotifications] could not store the push subscription:', insertError)
        return { ok: false, reason: `Salvataggio della sottoscrizione non riuscito: ${insertError.message}` }
      }

      return { ok: true }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn('Could not register push subscription:', err)
      return { ok: false, reason: `Registrazione push non riuscita: ${reason}` }
    } finally {
      isSubscribing.value = false
    }
  }

  async function resubscribePush(): Promise<boolean> {
    if (!import.meta.client || !('serviceWorker' in navigator) || !userId.value) {
      toast.add({
        title: 'Non supportato',
        description: 'Impossibile configurare le notifiche push in questo browser.',
        color: 'warning'
      })
      return false
    }

    refreshPermission()
    if (permission.value !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return false
    }

    const vapidKey = (config.public.vapidPublicKey || '').trim()
    if (!vapidKey) {
      toast.add({
        title: 'Chiave VAPID non trovata',
        description: 'La chiave pubblica VAPID non è configurata nell\'ambiente.',
        color: 'error'
      })
      return false
    }

    isSubscribing.value = true
    try {
      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg?.active) {
        reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 5000))
        ])
      }
      if (!reg || !('pushManager' in reg)) {
        throw new Error('PushManager non disponibile nel service worker.')
      }

      await reg.update().catch(() => {})

      // 1. Force unsubscribe stale browser subscription for this device only
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await deleteSubscriptionByEndpoint(existing.endpoint)
        await existing.unsubscribe().catch(() => {})
      }

      // 2. Re-subscribe cleanly with current key
      const newSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      })

      const json = newSub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Dati di sottoscrizione incompleti dal browser.')
      }

      const record = {
        user_id: userId.value,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString()
      }

      const { error } = await supabase.from('push_subscriptions').upsert(record, { onConflict: 'endpoint' })

      if (error) {
        console.warn('Upsert failed, trying clean insert fallback:', error.message)
        await deleteSubscriptionByEndpoint(json.endpoint)
        const { error: insErr } = await supabase.from('push_subscriptions').insert(record)
        if (insErr) throw insErr
      }

      toast.add({
        title: 'Notifiche sincronizzate!',
        description: 'Registrazione push rinnovata con successo sul server.',
        color: 'success'
      })
      return true
    } catch (err: any) {
      console.error('[resubscribePush] error:', err)
      toast.add({
        title: 'Errore sincronizzazione',
        description: err.message || 'Impossibile rinnovare la registrazione push.',
        color: 'error'
      })
      return false
    } finally {
      isSubscribing.value = false
    }
  }

  async function showNotification(title: string, options: NotificationOptions & { data?: { url?: string } }) {
    if (!import.meta.client) return
    if (permission.value !== 'granted') return

    // 1. If service worker is active with showNotification, try it first with a quick timeout
    if ('serviceWorker' in navigator) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 500))
        ])
        if (reg?.active && 'showNotification' in reg) {
          await reg.showNotification(title, options)
          return
        }
      } catch (swErr) {
        console.warn('SW showNotification fallback:', swErr)
      }
    }

    // 2. Direct browser Notification fallback (works in dev mode and normal tabs)
    if ('Notification' in window) {
      try {
        const notif = new Notification(title, options)
        notif.onclick = () => {
          window.focus()
          if (options.data?.url) {
            navigateTo(options.data.url)
          }
        }
      } catch (err) {
        console.error('Error showing window Notification:', err)
      }
    }
  }

  async function sendTestNotification(delaySeconds = 0) {
    if (!import.meta.client) return
    refreshPermission()

    if (!isSupported.value) {
      toast.add({
        title: 'Notifiche non supportate',
        description: 'Questo browser non supporta le notifiche. Su iPhone/iPad, aggiungi l\'app alla schermata Home.',
        color: 'warning'
      })
      return
    }

    if (permission.value !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return
    }

    // Ensure push subscription is synchronized with backend
    await subscribePush()

    if (delaySeconds === 0) {
      // 1. Show immediate local feedback notification
      await showNotification('ShareToDo — Notifica locale', {
        body: 'Permessi attivi! Invio notifica push dal server in corso...',
        icon: '/icons/icon-192.png',
        tag: `test-local-${Date.now()}`,
        data: { url: '/' }
      })
    }

    // 2. Trigger real server push
    await sendServerTestNotification(delaySeconds)
  }

  /**
   * Calls the reminders function, falling back to a plain fetch when the Supabase
   * client cannot invoke it. The function is deployed with JWT verification off
   * (the pg_cron job calls it with no session), so both paths reach it.
   */
  async function invokeReminders(payload: Record<string, unknown> = {}): Promise<PushDeliverySummary | null> {
    try {
      const { data, error } = await supabase.functions.invoke('send-reminders', { body: payload })
      if (error) throw error
      return (data ?? null) as PushDeliverySummary | null
    } catch (invokeErr) {
      console.warn('supabase.functions.invoke failed, retrying with fetch:', invokeErr)

      const client = supabase as unknown as { supabaseUrl?: string, supabaseKey?: string }
      const url = client.supabaseUrl || 'https://newhtivqunqtjswkxwhp.supabase.co'

      let accessToken: string | undefined
      try {
        const { data } = await supabase.auth.getSession()
        accessToken = data.session?.access_token
      } catch {
        // Anonymous call: the function only needs the payload.
      }

      const res = await fetch(`${url}/functions/v1/send-reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(client.supabaseKey ? { apikey: client.supabaseKey } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as PushDeliverySummary
    }
  }

  /** Turns the server's delivery report into one sentence for the user. */
  function describePushSummary(summary: PushDeliverySummary | null): string {
    if (!summary) return 'Il server non ha risposto come previsto.'

    const devices = summary.subscriptions ?? 0
    const delivered = summary.sent ?? 0
    const failure = summary.failures?.[0]

    if (summary.scheduled) {
      return `Il server invierà la notifica a ${devices} ${devices === 1 ? 'dispositivo' : 'dispositivi'} tra pochi secondi.`
    }
    if (delivered > 0) {
      return `Accettata dal servizio push per ${delivered} ${delivered === 1 ? 'dispositivo' : 'dispositivi'}.`
    }
    if (devices === 0) {
      return 'Il server non trova dispositivi registrati per questo account: riprova con «Reimposta e risincronizza».'
    }
    if (failure) {
      return `Il servizio push ha rifiutato l'invio (${failure.status ?? 'errore'}): ${failure.reason.slice(0, 160)}`
    }
    return summary.message || 'Invio non riuscito.'
  }

  async function sendServerTestNotification(delaySeconds = 0): Promise<boolean> {
    if (!import.meta.client) return false
    refreshPermission()

    if (permission.value !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return false
    }

    if (!userId.value) {
      toast.add({
        title: 'Accesso richiesto',
        description: 'Effettua l\'accesso per ricevere notifiche push.',
        color: 'warning'
      })
      return false
    }

    // Register this device before asking the server to push to it, and say why if
    // that registration fails — otherwise the server just reports "no devices".
    const registration = await subscribePush()
    if (!registration.ok) {
      toast.add({
        title: 'Registrazione push non riuscita',
        description: registration.reason || 'Questo dispositivo non è registrato per le notifiche.',
        color: 'error'
      })
      return false
    }

    let summary: PushDeliverySummary | null = null
    try {
      summary = await invokeReminders({ testUserId: userId.value, delaySeconds })
    } catch (err: any) {
      toast.add({
        title: 'Errore invio push',
        description: err?.message || 'Impossibile contattare la funzione di invio.',
        color: 'error'
      })
      return false
    }

    // The delayed test is scheduled server-side and answers at once, so the app
    // can be closed the moment this confirmation appears.
    if (summary?.scheduled) {
      const devices = summary.subscriptions ?? 0
      toast.add({
        title: `Test programmato tra ${delaySeconds} secondi`,
        description: `Ora puoi chiudere l'app: il server invierà la notifica a ${devices} ${devices === 1 ? 'dispositivo' : 'dispositivi'}.`,
        color: 'success'
      })
      return true
    }

    if ((summary?.sent ?? 0) > 0) {
      toast.add({
        title: 'Notifica push inviata dal server!',
        description: describePushSummary(summary),
        color: 'success'
      })
      return true
    }

    toast.add({
      title: delaySeconds > 0 ? 'Test non programmato' : 'Nessuna notifica inviata',
      description: describePushSummary(summary),
      color: 'warning'
    })
    return false
  }

  function triggerServerReminders() {
    if (!import.meta.client) return
    invokeReminders().catch((err) => {
      console.warn('Could not trigger server reminders:', err)
    })
  }

  function checkReminders() {
    if (!import.meta.client || permission.value !== 'granted') return
    const now = Date.now()

    for (const todo of todos.value) {
      if (todo.completed) continue
      if (todo.reminder_sent_at) continue
      if (notifiedIds.value.includes(todo.id)) continue

      // Calculate target reminder time
      let targetTime: number | null = null

      // If specific reminder_at is set on the activity
      if (todo.reminder_at) {
        targetTime = new Date(todo.reminder_at).getTime()
      } else if (todo.due_at && todo.reminder_minutes !== null) {
        // Otherwise calculate from due_at - reminder_minutes
        const dueTime = new Date(todo.due_at).getTime()
        targetTime = dueTime - (todo.reminder_minutes * 60 * 1000)
      } else if (todo.due_at) {
        targetTime = new Date(todo.due_at).getTime()
      }

      if (!targetTime) continue

      // Within a 30-minute window past target time, trigger notification
      if (now >= targetTime && now - targetTime < 30 * 60 * 1000) {
        notifiedIds.value.push(todo.id)
        const dueText = todo.due_at ? dueLabel(todo.due_at, todo.due_all_day) : ''
        const groupPrefix = todo.group_name && todo.group_name !== 'Generale' ? `[${todo.group_name}] ` : ''
        const body = dueText ? `${groupPrefix}Scadenza: ${dueText}` : `${groupPrefix}Promemoria attività`

        showNotification(`Promemoria: ${todo.title}`, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `todo-${todo.id}`,
          data: { url: `/?todo=${todo.id}`, todoId: todo.id }
        })

        // Notify server so all other users subscribed to this group receive the push
        triggerServerReminders()
      }
    }
  }

  /* ------------------------------------------------------------- diagnostics */

  function endpointHost(endpoint: string): string {
    try {
      return new URL(endpoint).hostname
    } catch {
      return 'endpoint sconosciuto'
    }
  }

  function describePlatform(userAgent: string | null): string {
    const ua = userAgent || ''
    const os =
      /Android/i.test(ua) ? 'Android'
        : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
          : /Windows/i.test(ua) ? 'Windows'
            : /Macintosh|Mac OS X/i.test(ua) ? 'macOS'
              : /Linux/i.test(ua) ? 'Linux'
                : 'SO sconosciuto'
    const browser =
      /Edg\//.test(ua) ? 'Edge'
        : /OPR\//.test(ua) ? 'Opera'
          : /Firefox\//.test(ua) ? 'Firefox'
            : /Chrome\//.test(ua) ? 'Chrome'
              : /Safari\//.test(ua) ? 'Safari'
                : 'browser sconosciuto'
    return `${os} · ${browser}`
  }

  /**
   * The devices the server holds for this account. `push_subscriptions` is scoped
   * to its owner by RLS, so this only ever reads the caller's own rows — and an
   * empty list is the answer to "why does the server say there is nothing to
   * push to?".
   */
  async function loadRegisteredDevices(): Promise<RegisteredPushDevice[]> {
    if (!import.meta.client || !userId.value) return []

    try {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, user_agent, created_at, last_seen_at')
        .eq('user_id', userId.value)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('[useNotifications] could not read push_subscriptions:', error.message)
        return []
      }

      return (data ?? []).map(row => ({
        id: row.id,
        endpointHost: endpointHost(row.endpoint),
        platform: describePlatform(row.user_agent),
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at
      }))
    } catch (err: unknown) {
      console.warn('[useNotifications] could not read push_subscriptions:', err)
      return []
    }
  }

  /**
   * The receipt log the service worker keeps for this device. Empty means the
   * worker has not received a push here at all (or is not running), which is what
   * separates "the phone never got it" from "the phone got it and showed it late".
   */
  async function fetchPushLog(timeoutMs = 2000): Promise<PushReceipt[]> {
    if (!import.meta.client || !('serviceWorker' in navigator)) return []

    let worker: ServiceWorker | null = null
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      worker = registration?.active ?? navigator.serviceWorker.controller ?? null
    } catch {
      worker = null
    }
    if (!worker) return []

    return new Promise<PushReceipt[]>((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      let timer: ReturnType<typeof setTimeout> | undefined

      const finish = (entries: PushReceipt[]) => {
        if (timer) clearTimeout(timer)
        navigator.serviceWorker.removeEventListener('message', onMessage)
        resolve(entries)
      }

      const onMessage = (event: MessageEvent) => {
        const data = event.data || {}
        if (data.type !== 'sharetodo:push-log' || data.requestId !== requestId) return
        finish(Array.isArray(data.entries) ? data.entries : [])
      }

      timer = setTimeout(() => finish([]), timeoutMs)
      navigator.serviceWorker.addEventListener('message', onMessage)
      worker!.postMessage({ type: 'sharetodo:push-log', requestId })
    })
  }

  // Reactively register or renew push subscription as soon as user & permission are ready
  watch(
    [() => userId.value, permission],
    ([userId, perm]) => {
      if (userId && perm === 'granted') {
        subscribePush()
      }
    },
    { immediate: true }
  )

  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    refreshPermission()
    if (permission.value === 'granted') {
      subscribePush()
      checkReminders()
    }

    timer = setInterval(() => {
      checkReminders()
    }, 30_000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshPermission()
        checkReminders()
        if (userId.value && permission.value === 'granted') {
          subscribePush()
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    onBeforeUnmount(() => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    })
  })

  return {
    permission,
    isSupported,
    isSubscribing,
    requestPermission,
    sendTestNotification,
    sendServerTestNotification,
    subscribePush,
    resubscribePush,
    checkReminders,
    loadRegisteredDevices,
    fetchPushLog
  }
}
