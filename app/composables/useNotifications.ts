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

export type PushDeliverySummary = {
  message?: string
  scheduled?: boolean
  delaySeconds?: number
  subscriptions?: number
  sent?: number
  failures?: Array<{ status: number | null, reason: string }>
}

export type PushRegistration = {
  ok: boolean
  reason?: string
}

export interface RegisteredPushDevice {
  id: number
  platform: string
  createdAt: string | null
  lastSeenAt: string | null
}

export function useNotifications() {
  const toast = useToast()
  const config = useRuntimeConfig()
  const supabase = useSupabaseClient<Database>()
  const { userId } = useCurrentUser()
  const { todos } = useTodos()

  const permission = useState<'default' | 'granted' | 'denied' | 'unsupported'>('notifications-permission', () => 'default')
  const isSubscribing = ref(false)
  const isTesting = ref(false)
  const registeredDevices = useState<RegisteredPushDevice[]>('push-registered-devices', () => [])
  const notifiedIds = useState<number[]>('notified-reminder-ids', () => [])

  const isSupported = computed(() => {
    if (!import.meta.client) return false
    return 'Notification' in window
  })

  const isIos = computed(() => {
    if (!import.meta.client) return false
    const ua = window.navigator.userAgent
    return /iPhone|iPad|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  })

  const isStandalone = computed(() => {
    if (!import.meta.client) return false
    return Boolean(
      (window.navigator as unknown as { standalone?: boolean }).standalone
      || window.matchMedia('(display-mode: standalone)').matches
    )
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
      if (isIos.value && !isStandalone.value) {
        toast.add({
          title: 'Installazione richiesta su iOS',
          description: 'Su iPhone e iPad tocca Condividi e seleziona "Aggiungi a schermata Home" per abilitare le notifiche.',
          color: 'warning'
        })
      } else {
        toast.add({
          title: 'Notifiche non supportate',
          description: 'Questo browser o dispositivo non supporta le notifiche push web.',
          color: 'warning'
        })
      }
      return false
    }

    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result === 'granted') {
        toast.add({
          title: 'Notifiche attivate!',
          description: 'Riceverai i promemoria impostati per le tue attività.',
          color: 'success'
        })
        await subscribePush()
        return true
      } else if (result === 'denied') {
        toast.add({
          title: 'Notifiche bloccate',
          description: 'Le notifiche sono bloccate nelle impostazioni del browser.',
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

  async function subscribePush(): Promise<PushRegistration> {
    if (!import.meta.client || !('serviceWorker' in navigator)) {
      return { ok: false, reason: 'Questo browser non supporta i service worker.' }
    }
    if (!userId.value) {
      return { ok: false, reason: 'Devi effettuare l\'accesso per registrare le notifiche.' }
    }

    const vapidKey = (config.public.vapidPublicKey || '').trim()
    if (!vapidKey) {
      const reason = 'Chiave pubblica VAPID non configurata.'
      console.warn(`[useNotifications] ${reason}`)
      return { ok: false, reason }
    }

    isSubscribing.value = true
    try {
      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg?.active) {
        reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 6000))
        ])
      }
      if (!reg || !('pushManager' in reg)) {
        return { ok: false, reason: 'Service worker o PushManager non pronti. Ricarica la pagina o riapri l\'app.' }
      }

      // Check existing subscription in the browser
      let sub = await reg.pushManager.getSubscription()

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
          console.info('[useNotifications] VAPID key mismatch, renewing subscription...')
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
          console.warn('[useNotifications] Subscribe attempt failed, attempting clean resubscribe:', subErr)
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
        return { ok: false, reason: 'Il browser non ha generato la sottoscrizione push.' }
      }

      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, reason: 'Dati di sottoscrizione push incompleti dal browser.' }
      }

      const record = {
        user_id: userId.value,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString()
      }

      const { error: upsertErr } = await supabase
        .from('push_subscriptions')
        .upsert(record, { onConflict: 'endpoint' })

      if (upsertErr) {
        console.warn('[useNotifications] upsert failed, renewing subscription for this user:', upsertErr.message)
        // If the endpoint was registered by an old session/user and RLS prevents updating, get a fresh endpoint
        await sub.unsubscribe().catch(() => {})
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        })
        const freshJson = sub.toJSON()
        const { error: insertErr } = await supabase.from('push_subscriptions').insert({
          user_id: userId.value,
          endpoint: freshJson.endpoint,
          p256dh: freshJson.keys!.p256dh,
          auth: freshJson.keys!.auth,
          user_agent: navigator.userAgent,
          last_seen_at: new Date().toISOString()
        })
        if (insertErr) {
          return { ok: false, reason: `Salvataggio sottoscrizione fallito: ${insertErr.message}` }
        }
      }

      await loadRegisteredDevices()
      return { ok: true }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error('[useNotifications] subscribePush error:', err)
      return { ok: false, reason }
    } finally {
      isSubscribing.value = false
    }
  }

  async function resubscribePush(): Promise<boolean> {
    if (!import.meta.client || !('serviceWorker' in navigator)) return false
    isSubscribing.value = true
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint).catch(() => {})
        await existing.unsubscribe().catch(() => {})
      }
      const res = await subscribePush()
      if (res.ok) {
        toast.add({
          title: 'Notifiche sincronizzate!',
          description: 'Questo dispositivo è registrato per ricevere i promemoria.',
          color: 'success'
        })
        return true
      } else {
        toast.add({
          title: 'Sincronizzazione non riuscita',
          description: res.reason,
          color: 'error'
        })
        return false
      }
    } catch (err: any) {
      toast.add({
        title: 'Errore',
        description: err?.message || 'Impossibile risincronizzare le notifiche.',
        color: 'error'
      })
      return false
    } finally {
      isSubscribing.value = false
    }
  }

  async function invokeReminders(payload: Record<string, unknown> = {}): Promise<PushDeliverySummary | null> {
    try {
      const { data, error } = await supabase.functions.invoke('send-reminders', { body: payload })
      if (error) throw error
      return (data ?? null) as PushDeliverySummary | null
    } catch (invokeErr) {
      console.warn('supabase.functions.invoke fallback to fetch:', invokeErr)

      const client = supabase as unknown as { supabaseUrl?: string, supabaseKey?: string }
      const url = client.supabaseUrl || 'https://newhtivqunqtjswkxwhp.supabase.co'

      let accessToken: string | undefined
      try {
        const { data } = await supabase.auth.getSession()
        accessToken = data.session?.access_token
      } catch {
        // Anonymous / fallback call
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

  async function sendTestNotification(delaySeconds = 0): Promise<boolean> {
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

    isTesting.value = true
    try {
      const registration = await subscribePush()
      if (!registration.ok) {
        toast.add({
          title: 'Registrazione non riuscita',
          description: registration.reason || 'Impossibile registrare questo dispositivo.',
          color: 'error'
        })
        return false
      }

      const res = await invokeReminders({ testUserId: userId.value, delaySeconds })

      if (delaySeconds > 0) {
        toast.add({
          title: `Test programmato tra ${delaySeconds} secondi!`,
          description: 'Ora puoi chiudere l\'app o bloccare lo schermo per verificare che arrivi ad app chiusa.',
          color: 'success'
        })
        return true
      }

      if (res && res.sent && res.sent > 0) {
        toast.add({
          title: 'Notifica inviata!',
          description: `Inviata dal server con successo a ${res.sent} ${res.sent === 1 ? 'dispositivo' : 'dispositivi'}.`,
          color: 'success'
        })
        return true
      } else {
        toast.add({
          title: 'Notifica di prova',
          description: res?.message || 'Richiesta elaborata dal server.',
          color: 'info'
        })
        return true
      }
    } catch (err: any) {
      toast.add({
        title: 'Errore invio notifica',
        description: err?.message || 'Impossibile contattare il server.',
        color: 'error'
      })
      return false
    } finally {
      isTesting.value = false
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
                : 'Dispositivo'
    const browser =
      /Edg\//.test(ua) ? 'Edge'
        : /OPR\//.test(ua) ? 'Opera'
          : /Firefox\//.test(ua) ? 'Firefox'
            : /Chrome\//.test(ua) ? 'Chrome'
              : /Safari\//.test(ua) ? 'Safari'
                : 'Browser'
    return `${os} · ${browser}`
  }

  async function loadRegisteredDevices(): Promise<RegisteredPushDevice[]> {
    if (!import.meta.client || !userId.value) return []
    try {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, user_agent, created_at, last_seen_at')
        .eq('user_id', userId.value)
        .order('last_seen_at', { ascending: false })

      if (error) {
        console.warn('[useNotifications] loadRegisteredDevices failed:', error.message)
        return []
      }

      const list: RegisteredPushDevice[] = (data || []).map(row => ({
        id: row.id,
        platform: describePlatform(row.user_agent),
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at
      }))
      registeredDevices.value = list
      return list
    } catch (err) {
      console.warn('[useNotifications] loadRegisteredDevices error:', err)
      return []
    }
  }

  async function showNotification(title: string, options: NotificationOptions & { data?: { url?: string } }) {
    if (!import.meta.client) return
    if (permission.value !== 'granted') return

    // 1. Try service worker showNotification first
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

    // 2. Direct browser Notification fallback
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

      let targetTime: number | null = null

      if (todo.reminder_at) {
        targetTime = new Date(todo.reminder_at).getTime()
      } else if (todo.due_at && todo.reminder_minutes !== null && todo.reminder_minutes !== undefined) {
        const dueTime = new Date(todo.due_at).getTime()
        targetTime = dueTime - (todo.reminder_minutes * 60 * 1000)
      }

      if (!targetTime) continue

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

        triggerServerReminders()
      }
    }
  }

  // Reactively register or renew push subscription as soon as user & permission are ready
  watch(
    [() => userId.value, permission],
    ([id, perm]) => {
      if (id && perm === 'granted') {
        subscribePush()
        loadRegisteredDevices()
      }
    },
    { immediate: true }
  )

  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    refreshPermission()
    if (permission.value === 'granted') {
      subscribePush()
      loadRegisteredDevices()
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
          loadRegisteredDevices()
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
    isIos,
    isStandalone,
    isSubscribing,
    isTesting,
    registeredDevices,
    requestPermission,
    subscribePush,
    resubscribePush,
    sendTestNotification,
    loadRegisteredDevices,
    checkReminders
  }
}
