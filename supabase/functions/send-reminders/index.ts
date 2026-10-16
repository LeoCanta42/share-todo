// Supabase Edge Function: send-reminders
// Schedules and delivers due activity reminders via Web Push to todos owners and all shared group members.
// Supports both scheduled reminders (called by pg_cron every minute) and on-demand test pushes.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
}

const MAX_PUSH_DELAY_SECONDS = 60
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/** Apple APNs Web Push requires apns-push-type and apns-priority headers. */
function pushHeadersFor(endpoint: string): Record<string, string> {
  const isApple = endpoint.includes('push.apple.com') || endpoint.includes('apple.com')
  return isApple ? { 'apns-push-type': 'alert', 'apns-priority': '10' } : {}
}

/** Access EdgeRuntime.waitUntil for background execution when responding early. */
function backgroundRuntime(): { waitUntil: (task: Promise<unknown>) => void } | null {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  return typeof runtime?.waitUntil === 'function'
    ? (runtime as { waitUntil: (task: Promise<unknown>) => void })
    : null
}

interface SubscriptionRow {
  id: number
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
}

/** Sends a push payload to a list of subscriptions, handling Apple-specific headers and deleting dead endpoints. */
async function deliverToSubscriptions(
  supabase: any,
  subscriptions: SubscriptionRow[],
  payload: string,
  topic?: string
): Promise<{ sent: number; failures: Array<{ status: number | null; reason: string }> }> {
  let sent = 0
  const failures: Array<{ status: number | null; reason: string }> = []

  for (const sub of subscriptions) {
    const isApple = sub.endpoint.includes('push.apple.com') || sub.endpoint.includes('apple.com')
    const pushHeaders = pushHeadersFor(sub.endpoint)

    const pushOptions: Record<string, any> = {
      TTL: 86400,
      urgency: 'high',
      headers: pushHeaders
    }

    // IMPORTANT: Apple Web Push rejects custom Topic headers with HTTP 400 BadWebPushTopic.
    // Only pass topic to non-Apple push services (like Google FCM for Android/Chrome).
    if (!isApple && topic) {
      pushOptions.topic = topic.slice(0, 32)
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        payload,
        pushOptions
      )
      sent++
    } catch (pushErr: any) {
      const status = pushErr?.statusCode ?? null
      const reason = String(pushErr?.body || pushErr?.message || 'unknown error')
      failures.push({ status, reason })
      console.error(`[send-reminders] push to ${sub.endpoint} failed (${status ?? 'n/a'}): ${reason}`)

      // 404 or 410 Gone indicates the device unsubscribed or the endpoint expired
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }

  return { sent, failures }
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
    return jsonResponse({ error: 'VAPID keys not configured in Edge Function environment' }, 500)
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const reqBody = await req.json().catch(() => ({}))
    const testUserId = reqBody?.testUserId
    const delaySeconds = Number(reqBody?.delaySeconds || 0)

    // =========================================================================
    // ON-DEMAND TEST PUSH
    // =========================================================================
    if (testUserId) {
      const { data: subscriptions, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_id')
        .eq('user_id', testUserId)

      if (subsError) {
        return jsonResponse({ message: `Database error: ${subsError.message}`, subscriptions: 0, sent: 0 }, 500)
      }

      if (!subscriptions || subscriptions.length === 0) {
        return jsonResponse({
          message: 'Nessun dispositivo registrato trovato per questo account. Apri l\'app sul tuo dispositivo e abilita le notifiche.',
          subscriptions: 0,
          sent: 0
        })
      }

      const testPayload = JSON.stringify({
        title: 'ShareToDo — Notifica di prova',
        body: 'La notifica push dal server è arrivata con successo! I promemoria funzionano anche ad app chiusa! 🔔',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        url: '/',
        tag: `test-push-${Date.now()}`,
        data: {
          url: '/',
          test: true
        }
      })

      if (delaySeconds > 0) {
        const delayMs = Math.min(Math.max(delaySeconds, 1), MAX_PUSH_DELAY_SECONDS) * 1000
        const runtime = backgroundRuntime()

        if (runtime) {
          runtime.waitUntil(
            (async () => {
              await sleep(delayMs)
              await deliverToSubscriptions(supabase, subscriptions, testPayload, 'test-push')
            })().catch((err) => console.error('[test-push] background delivery error:', err))
          )

          return jsonResponse({
            message: `Notifica programmata tra ${delaySeconds} secondi. Ora puoi chiudere l'app o bloccare lo schermo!`,
            scheduled: true,
            delaySeconds,
            subscriptions: subscriptions.length,
            sent: 0
          })
        }

        // If waitUntil runtime hook is not exposed, wait inline
        await sleep(delayMs)
        const { sent, failures } = await deliverToSubscriptions(supabase, subscriptions, testPayload, 'test-push')
        return jsonResponse({
          message: sent > 0 ? 'Notifica inviata con successo!' : 'Invio notifica non riuscito.',
          scheduled: true,
          delaySeconds,
          subscriptions: subscriptions.length,
          sent,
          failures
        })
      }

      // Immediate test push
      const { sent, failures } = await deliverToSubscriptions(supabase, subscriptions, testPayload, 'test-push')
      return jsonResponse({
        message: sent > 0 ? 'Notifica inviata con successo!' : 'Nessun dispositivo ha potuto ricevere la notifica.',
        scheduled: false,
        subscriptions: subscriptions.length,
        sent,
        failures
      })
    }

    // =========================================================================
    // SCHEDULED REMINDERS
    // =========================================================================
    const now = new Date()
    const nowMs = now.getTime()
    const twentyFourHoursAgoMs = nowMs - 24 * 60 * 60 * 1000

    // Only look for uncompleted activities that have not had a reminder sent yet
    // and actually have a reminder set (either reminder_at or reminder_minutes)
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('id, title, user_id, group_id, group_name, due_at, due_all_day, reminder_minutes, reminder_at, timezone')
      .eq('completed', false)
      .is('reminder_sent_at', null)
      .or('reminder_at.not.is.null,reminder_minutes.not.is.null')

    if (todosError) throw todosError

    const eligibleTodos: Array<{
      todo: any
      shouldSendPush: boolean
    }> = []

    for (const todo of (todos || [])) {
      let targetTime: number | null = null

      if (todo.reminder_at) {
        targetTime = new Date(todo.reminder_at).getTime()
      } else if (todo.due_at && todo.reminder_minutes !== null && todo.reminder_minutes !== undefined) {
        const dueTime = new Date(todo.due_at).getTime()
        targetTime = dueTime - (todo.reminder_minutes * 60 * 1000)
      }

      if (!targetTime || isNaN(targetTime)) continue

      if (targetTime <= nowMs) {
        // Send push only if due within the last 24h window; older ones are marked sent without spamming
        const shouldSendPush = targetTime >= twentyFourHoursAgoMs
        eligibleTodos.push({ todo, shouldSendPush })
      }
    }

    if (eligibleTodos.length === 0) {
      return jsonResponse({ message: 'No reminders due', processed: 0, sent: 0 })
    }

    let sentCount = 0
    const retried: number[] = []
    const details: Array<Record<string, unknown>> = []

    const releaseReminderClaim = async (todoId: number) => {
      await supabase.from('todos').update({ reminder_sent_at: null }).eq('id', todoId)
    }

    for (const { todo, shouldSendPush } of eligibleTodos) {
      // Claim reminder first so concurrent cron runs do not double-send
      await supabase
        .from('todos')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', todo.id)

      if (!shouldSendPush) {
        details.push({ todoId: todo.id, status: 'expired', devices: 0, sent: 0 })
        continue
      }

      // Collect recipient user IDs
      const recipientIds = new Set<string>()
      if (todo.user_id) recipientIds.add(todo.user_id)

      if (todo.group_id) {
        try {
          const { data: grp } = await supabase
            .from('groups')
            .select('owner_id, path')
            .eq('id', todo.group_id)
            .single()

          if (grp) {
            if (grp.owner_id) recipientIds.add(grp.owner_id)

            const groupPath: string[] = Array.isArray(grp.path) ? grp.path : [todo.group_id]
            const { data: shares } = await supabase
              .from('todo_shares')
              .select('shared_with_id, shared_with_email, group_id')
              .eq('owner_id', grp.owner_id)

            if (shares && shares.length > 0) {
              const pendingEmails: string[] = []

              for (const s of shares) {
                const coversGroup = !s.group_id || groupPath.includes(s.group_id)
                if (coversGroup) {
                  if (s.shared_with_id) {
                    recipientIds.add(s.shared_with_id)
                  } else if (s.shared_with_email) {
                    pendingEmails.push(s.shared_with_email.toLowerCase())
                  }
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
          }
        } catch (grpErr) {
          console.warn('[send-reminders] error resolving group recipients for todo', todo.id, grpErr)
        }
      } else if (todo.user_id) {
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
          console.warn('[send-reminders] error resolving whole-list recipients for todo', todo.id, wholeErr)
        }
      }

      if (recipientIds.size === 0) {
        details.push({ todoId: todo.id, status: 'no-recipients', devices: 0, sent: 0 })
        continue
      }

      // Query registered push subscriptions for all recipients
      const { data: subscriptions, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_id')
        .in('user_id', Array.from(recipientIds))

      if (subsError) {
        await releaseReminderClaim(todo.id)
        retried.push(todo.id)
        console.error(`[send-reminders] todo ${todo.id}: subscription lookup failed: ${subsError.message}`)
        details.push({ todoId: todo.id, status: 'subscription-lookup-failed', reason: subsError.message, devices: 0, sent: 0 })
        continue
      }

      if (!subscriptions || subscriptions.length === 0) {
        // No devices registered yet: keep reminder pending so it can be delivered when a device registers
        await releaseReminderClaim(todo.id)
        retried.push(todo.id)
        details.push({ todoId: todo.id, status: 'no-devices', recipients: recipientIds.size, devices: 0, sent: 0 })
        continue
      }

      // Format reminder message with user timezone
      const tz = todo.timezone || 'Europe/Rome'
      const groupTag = todo.group_name && todo.group_name !== 'Generale' ? `[${todo.group_name}] ` : ''
      let body = `${groupTag}Hai un'attività in scadenza!`

      if (todo.due_at) {
        try {
          const d = new Date(todo.due_at)
          const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: tz })
          body = todo.due_all_day ? `${groupTag}In scadenza oggi` : `${groupTag}In scadenza alle ${timeStr}`
        } catch {
          body = `${groupTag}Hai un'attività in scadenza!`
        }
      } else if (todo.reminder_at) {
        try {
          const d = new Date(todo.reminder_at)
          const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: tz })
          body = `${groupTag}Promemoria per le ${timeStr}`
        } catch {
          body = `${groupTag}Hai un'attività in scadenza!`
        }
      }

      const payload = JSON.stringify({
        title: `Promemoria: ${todo.title}`,
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        url: `/?todo=${todo.id}`,
        tag: `todo-${todo.id}`,
        data: {
          url: `/?todo=${todo.id}`,
          todoId: todo.id
        }
      })

      const { sent, failures } = await deliverToSubscriptions(
        supabase,
        subscriptions,
        payload,
        `todo-${todo.id}`
      )

      if (sent > 0) {
        sentCount += sent
        details.push({ todoId: todo.id, status: 'delivered', recipients: recipientIds.size, devices: subscriptions.length, sent })
      } else {
        await releaseReminderClaim(todo.id)
        retried.push(todo.id)
        console.error(`[send-reminders] todo ${todo.id}: delivery failed to all ${subscriptions.length} devices`)
        details.push({ todoId: todo.id, status: 'send-failed', recipients: recipientIds.size, devices: subscriptions.length, sent: 0, failures })
      }
    }

    console.log(`[send-reminders] processed=${eligibleTodos.length} sent=${sentCount} retried=${retried.length}`)

    return jsonResponse({
      message: 'Reminders processed',
      processed: eligibleTodos.length,
      sent: sentCount,
      retried: retried.length,
      details
    })
  } catch (err: any) {
    console.error('[send-reminders] unhandled exception:', err?.message || err)
    return jsonResponse({ error: err.message }, 500)
  }
})
