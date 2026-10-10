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
  const { todos, markReminderSent } = useTodos()

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
    const vapidKey = config.public.vapidPublicKey
    if (!vapidKey) return

    isSubscribing.value = true
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1000))
      ])
      if (!reg || !('pushManager' in reg)) return

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        })
      }

      const json = sub.toJSON()
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await supabase.from('push_subscriptions').upsert({
          user_id: user.value.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'endpoint' })
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
          navigator.serviceWorker.getRegistration(),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 400))
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

  async function sendTestNotification() {
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

    await showNotification('ShareToDo — Notifica di prova', {
      body: 'Le notifiche sono configurate e funzionanti! 🔔',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'test-notification',
      data: { url: '/' }
    })

    toast.add({
      title: 'Notifica inviata',
      description: 'Controlla il centro notifiche del tuo dispositivo.',
      color: 'success'
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
      }

      if (!targetTime) continue

      // Within a 30-minute window past target time, trigger notification
      if (now >= targetTime && now - targetTime < 30 * 60 * 1000) {
        notifiedIds.value.push(todo.id)
        const dueText = todo.due_at ? dueLabel(todo.due_at, todo.due_all_day) : ''
        const body = dueText ? `Scadenza: ${dueText}` : 'Promemoria attività'

        showNotification(`Promemoria: ${todo.title}`, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `todo-${todo.id}`,
          data: { url: `/?todo=${todo.id}`, todoId: todo.id }
        })

        markReminderSent(todo.id)
      }
    }
  }

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
    subscribePush,
    checkReminders
  }
}
