// Supabase Edge Function: send-reminders
// Schedules and delivers due activity reminders via Web Push.
//
// Required Secrets in Supabase:
// - VAPID_PUBLIC_KEY
// - VAPID_PRIVATE_KEY
// - VAPID_SUBJECT (e.g. https://your-domain.com - identifies your application to push services, no emails are ever sent)
// - SUPABASE_URL (default)
// - SUPABASE_SERVICE_ROLE_KEY (default)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'https://sharetodo.app'

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured in Edge Function environment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

    // 1. Find all active activities whose reminder time has arrived
    // reminder time = due_at - (reminder_minutes * 1 minute)
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('id, title, user_id, group_id, due_at, due_all_day, reminder_minutes')
      .eq('completed', false)
      .is('reminder_sent_at', null)
      .not('reminder_minutes', 'is', null)
      .not('due_at', 'is', null)
      .gte('due_at', twoHoursAgo)

    if (todosError) throw todosError

    const eligibleTodos = (todos || []).filter((todo) => {
      if (!todo.due_at || todo.reminder_minutes === null) return false
      const dueTime = new Date(todo.due_at).getTime()
      const targetTime = dueTime - (todo.reminder_minutes * 60 * 1000)
      return targetTime <= now.getTime()
    })

    if (eligibleTodos.length === 0) {
      return new Response(JSON.stringify({ message: 'No reminders due', processed: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let sentCount = 0

    for (const todo of eligibleTodos) {
      // Mark as sent immediately to avoid duplicates across concurrent runs
      await supabase
        .from('todos')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', todo.id)

      if (!todo.user_id) continue

      // Look up target subscriptions for this user
      const { data: subscriptions, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', todo.user_id)

      if (subsError || !subscriptions) continue

      const payload = JSON.stringify({
        title: `Promemoria: ${todo.title}`,
        body: 'La tua attività è in scadenza!',
        url: `/?todo=${todo.id}`,
        tag: `todo-${todo.id}`
      })

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            payload
          )
          sentCount++
        } catch (pushErr: any) {
          // If subscription is expired or gone (404/410), prune it
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            console.error('Error sending push to endpoint:', sub.endpoint, pushErr)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: 'Reminders processed', processed: eligibleTodos.length, sent: sentCount }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
