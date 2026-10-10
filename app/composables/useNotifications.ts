import type { Database } from '~/types/database.types'
import { dueLabel } from '~/utils/date'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function useNotifications() {
  const toast = useToast()
  const config = useRuntimeConfig()
  const supabase = useSupabaseClient<Database>()
  const { user } = useAuth()
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

  async function subscribePush() {
    if (!import.meta.client || !('serviceWorker' in navigator) || !user.value) return
    const vapidKey = config.public.vapidPublicKey || 'BM9EmQ1uDFTdn6LLHGlgPLyRDZt6pkpWv38o4xjk3tpnBl7f790uhITipDreOXFEVhHqn_d12E-0gOHZDlXneVc'
    if (!vapidKey) return

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
        console.warn('Service worker or pushManager is not ready')
        return
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

      if (!sub) return

      const json = sub.toJSON()
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        const { error } = await supabase.from('push_subscriptions').upsert({
          user_id: user.value.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'endpoint' })

        if (error) {
          console.error('Error saving push subscription to Supabase:', error)
          // If upsert failed on RLS conflict from a prior session, remove old endpoint and insert clean
          await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint).catch(() => {})
          await supabase.from('push_subscriptions').insert({
            user_id: user.value.id,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent,
            last_seen_at: new Date().toISOString()
          }).catch(() => {})
        }
      }
    } catch (err: unknown) {
      console.warn('Could not register push subscription:', err)
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

  async function sendServerTestNotification(delaySeconds = 0): Promise<boolean> {
    if (!import.meta.client) return false
    refreshPermission()

    if (permission.value !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return false
    }

    await subscribePush()

    if (!user.value) {
      toast.add({
        title: 'Accesso richiesto',
        description: 'Effettua l\'accesso per ricevere notifiche push.',
        color: 'warning'
      })
      return false
    }

    try {
      if (delaySeconds > 0) {
        toast.add({
          title: `Invio programmato tra ${delaySeconds} secondi!`,
          description: 'Chiudi l\'app adesso o blocca lo schermo per testare la notifica ad app chiusa 🔔',
          color: 'info'
        })
      }

      const url = (supabase as any)?.supabaseUrl || 'https://newhtivqunqtjswkxwhp.supabase.co'
      const res = await fetch(`${url}/functions/v1/send-reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testUserId: user.value.id,
          delaySeconds
        })
      })

      const data = await res.json()
      if (data.sent > 0) {
        if (delaySeconds === 0) {
          toast.add({
            title: 'Notifica push inviata dal server!',
            description: 'Notifica inviata con successo!',
            color: 'success'
          })
        }
        return true
      } else {
        toast.add({
          title: 'Dispositivo in sincronizzazione',
          description: 'Sottoscrizione push registrata. Se non arriva, riavvia l\'app.',
          color: 'info'
        })
        return false
      }
    } catch (err: any) {
      toast.add({
        title: 'Errore invio push',
        description: err.message || 'Impossibile inviare la notifica di prova.',
        color: 'error'
      })
      return false
    }
  }

  function triggerServerReminders() {
    if (!import.meta.client) return
    const url = (supabase as any)?.supabaseUrl || 'https://newhtivqunqtjswkxwhp.supabase.co'
    fetch(`${url}/functions/v1/send-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch((err) => {
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

  // Reactively register or renew push subscription as soon as user & permission are ready
  watch(
    [() => user.value?.id, permission],
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
        if (user.value && permission.value === 'granted') {
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
    checkReminders
  }
}
