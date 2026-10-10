// Supabase Edge Function: send-reminders
// Schedules and delivers due activity reminders via Web Push to todos owners and all shared group members.
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'https://sharetodo.app'

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured in Edge Function environment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const reqBody = await req.json().catch(() => ({}))
    const testUserId = reqBody?.testUserId
    const delaySeconds = Number(reqBody?.delaySeconds || 0)

    if (testUserId) {
      if (delaySeconds > 0) {
        const waitMs = Math.min(Math.max(delaySeconds, 1), 60) * 1000
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }

      const { data: subscriptions, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_id')
        .eq('user_id', testUserId)

      if (subsError || !subscriptions || subscriptions.length === 0) {
        return new Response(JSON.stringify({ message: 'No subscriptions found for user', sent: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const testPayload = JSON.stringify({
        title: 'ShareToDo — Notifica di prova',
        body: 'La notifica push dal server è arrivata con successo! Funziona anche ad app chiusa! 🔔',
        icon: '/icons/icon-192.png',
        url: '/',
        tag: `test-push-${Date.now()}`,
        data: { url: '/' }
      })

      let testSent = 0
      for (const sub of subscriptions) {
        try {
          const isApple = sub.endpoint.includes('push.apple.com') || sub.endpoint.includes('apple.com')
          const pushHeaders: Record<string, string> = {}
          if (isApple) {
            pushHeaders['apns-push-type'] = 'alert'
            pushHeaders['apns-priority'] = '10'
          }

          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            testPayload,
            {
              TTL: 86400,
              urgency: 'high',
              headers: pushHeaders
            }
          )
          testSent++
        } catch (pushErr: any) {
          console.error(`Error sending test push to ${sub.endpoint}:`, pushErr.statusCode, pushErr.body || pushErr.message)
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }

      return new Response(JSON.stringify({ message: 'Test push processed', sent: testSent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const now = new Date()
    const nowMs = now.getTime()
    const twentyFourHoursAgoMs = nowMs - 24 * 60 * 60 * 1000

    // 1. Find all active activities whose reminder has not been sent yet
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('id, title, user_id, group_id, group_name, due_at, due_all_day, reminder_minutes, reminder_at')
      .eq('completed', false)
      .is('reminder_sent_at', null)

    if (todosError) throw todosError

    const eligibleTodos: Array<{
      todo: any
      shouldSendPush: boolean
    }> = []

    for (const todo of (todos || [])) {
      let targetTime: number | null = null

      if (todo.reminder_at) {
        targetTime = new Date(todo.reminder_at).getTime()
      } else if (todo.due_at && todo.reminder_minutes !== null) {
        const dueTime = new Date(todo.due_at).getTime()
        targetTime = dueTime - (todo.reminder_minutes * 60 * 1000)
      } else if (todo.due_at) {
        // If due date is set but no relative minutes chosen, default reminder is at due date
        targetTime = new Date(todo.due_at).getTime()
      }

      if (!targetTime || isNaN(targetTime)) continue

      if (targetTime <= nowMs) {
        // Send push only if due within the last 24h; otherwise just mark as sent to avoid spam
        const shouldSendPush = targetTime >= twentyFourHoursAgoMs
        eligibleTodos.push({ todo, shouldSendPush })
      }
    }

    if (eligibleTodos.length === 0) {
      return new Response(JSON.stringify({ message: 'No reminders due', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let sentCount = 0

    for (const { todo, shouldSendPush } of eligibleTodos) {
      // Mark as sent immediately to avoid duplicates across concurrent runs
      await supabase
        .from('todos')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', todo.id)

      if (!shouldSendPush) continue

      // Look up target recipients:
      // 1. The creator of the todo
      const recipientIds = new Set<string>()
      if (todo.user_id) recipientIds.add(todo.user_id)

      // 2. If the todo belongs to a group, include the group owner and anyone with access to the group
      if (todo.group_id) {
        try {
          const { data: grp } = await supabase
            .from('groups')
            .select('owner_id, path')
            .eq('id', todo.group_id)
            .single()

          if (grp) {
            if (grp.owner_id) recipientIds.add(grp.owner_id)

            // path is an array of UUIDs from root down to self
            const groupPath: string[] = Array.isArray(grp.path) ? grp.path : [todo.group_id]

            // Look up all shares granted by the group owner covering this group or its ancestors, or whole-list
            const { data: shares } = await supabase
              .from('todo_shares')
              .select('shared_with_id, shared_with_email, group_id')
              .eq('owner_id', grp.owner_id)

            if (shares && shares.length > 0) {
              const pendingEmails: string[] = []

              for (const s of shares) {
                // If group_id is null, it's a whole-list grant; otherwise it must cover any group in the path
                const coversGroup = !s.group_id || groupPath.includes(s.group_id)
                if (coversGroup) {
                  if (s.shared_with_id) {
                    recipientIds.add(s.shared_with_id)
                  } else if (s.shared_with_email) {
                    pendingEmails.push(s.shared_with_email.toLowerCase())
                  }
                }
              }

              // Resolve pending invitations where recipient's user ID is not yet linked in todo_shares
              if (pendingEmails.length > 0) {
                const { data: matchedProfiles } = await supabase
                  .from('profiles')
                  .select('id, email')
                  .in('email', pendingEmails)
                if (matchedProfiles) {
                  for (const p of matchedProfiles) {
                    if (p.id) recipientIds.add(p.id)
                  }
                }
              }
            }
          }
        } catch (grpErr) {
          console.warn('Error resolving group recipients for todo', todo.id, grpErr)
        }
      } else if (todo.user_id) {
        // If todo has no group_id, check whole-list shares of creator
        try {
          const { data: wholeShares } = await supabase
            .from('todo_shares')
            .select('shared_with_id, shared_with_email')
            .eq('owner_id', todo.user_id)
            .is('group_id', null)

          if (wholeShares && wholeShares.length > 0) {
            const pendingEmails: string[] = []
            for (const s of wholeShares) {
              if (s.shared_with_id) {
                recipientIds.add(s.shared_with_id)
              } else if (s.shared_with_email) {
                pendingEmails.push(s.shared_with_email.toLowerCase())
              }
            }
            if (pendingEmails.length > 0) {
              const { data: matchedProfiles } = await supabase
                .from('profiles')
                .select('id, email')
                .in('email', pendingEmails)
              if (matchedProfiles) {
                for (const p of matchedProfiles) {
                  if (p.id) recipientIds.add(p.id)
                }
              }
            }
          }
        } catch (wholeErr) {
          console.warn('Error resolving whole-list recipients for todo', todo.id, wholeErr)
        }
      }

      if (recipientIds.size === 0) continue

      // Look up push subscriptions for all resolved recipients
      const { data: subscriptions, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_id')
        .in('user_id', Array.from(recipientIds))

      if (subsError || !subscriptions || subscriptions.length === 0) continue

      const groupTag = todo.group_name && todo.group_name !== 'Generale' ? `[${todo.group_name}] ` : ''
      let body = `${groupTag}Hai un'attività in scadenza!`
      if (todo.due_at) {
        try {
          const d = new Date(todo.due_at)
          const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
          body = todo.due_all_day ? `${groupTag}In scadenza oggi` : `${groupTag}In scadenza alle ${timeStr}`
        } catch {
          body = `${groupTag}Hai un'attività in scadenza!`
        }
      }

      const payload = JSON.stringify({
        title: `Promemoria: ${todo.title}`,
        body,
        url: `/?todo=${todo.id}`,
        tag: `todo-${todo.id}`,
        data: {
          url: `/?todo=${todo.id}`,
          todoId: todo.id
        }
      })

      for (const sub of subscriptions) {
        try {
          const isApple = sub.endpoint.includes('push.apple.com') || sub.endpoint.includes('apple.com')
          const pushHeaders: Record<string, string> = {}
          if (isApple) {
            pushHeaders['apns-push-type'] = 'alert'
            pushHeaders['apns-priority'] = '10'
          }

          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            payload,
            {
              TTL: 86400,
              urgency: 'high',
              topic: `todo-${todo.id}`.slice(0, 32),
              headers: pushHeaders
            }
          )
          sentCount++
        } catch (pushErr: any) {
          console.error(`Error sending push to endpoint: ${sub.endpoint}:`, pushErr.statusCode, pushErr.body || pushErr.message)
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: 'Reminders processed', processed: eligibleTodos.length, sent: sentCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
