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

const MAX_PUSH_DELAY_SECONDS = 60

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/**
 * The `EdgeRuntime.waitUntil` hook Supabase exposes, when the runtime provides it.
 *
 * This is what makes the delayed test meaningful: that test tells the user to
 * close the app, and a delay awaited inside the request would be cancelled (and
 * always holds the connection open) the moment the app asking for it goes away.
 *
 * Note the task must only be *started* once we know the runtime keeps it alive —
 * building the promise first would run the send twice on runtimes without it.
 */
function backgroundRuntime(): { waitUntil: (task: Promise<unknown>) => void } | null {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  return typeof runtime?.waitUntil === 'function'
    ? (runtime as { waitUntil: (task: Promise<unknown>) => void })
    : null
}

/** Apple's push service wants the APNs headers; other services ignore them. */
function pushHeadersFor(endpoint: string): Record<string, string> {
  const isApple = endpoint.includes('push.apple.com') || endpoint.includes('apple.com')
  return isApple ? { 'apns-push-type': 'alert', 'apns-priority': '10' } : {}
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
      const testPayload = JSON.stringify({
        title: 'ShareToDo — Notifica di prova',
        body: 'La notifica push dal server è arrivata con successo! Funziona anche ad app chiusa! 🔔',
        icon: '/icons/icon-192.png',
        url: '/',
        tag: `test-push-${Date.now()}`,
        data: { url: '/' }
      })

      const loadTestSubscriptions = async () => {
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth, user_id')
          .eq('user_id', testUserId)

        if (error) {
          const reason = `Could not read push_subscriptions: ${error.message}`
          console.error(`[test-push] ${reason}`)
          return { subscriptions: [] as any[], error: reason }
        }
        return { subscriptions: data ?? [], error: null as string | null }
      }

      const deliverTestPush = async (subscriptions: any[]) => {
        const failures: Array<{ status: number | null; reason: string }> = []
        let sent = 0

        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              },
              testPayload,
              {
                TTL: 86400,
                urgency: 'high',
                headers: pushHeadersFor(sub.endpoint)
              }
            )
            sent++
          } catch (pushErr: any) {
            const status = pushErr?.statusCode ?? null
            const reason = String(pushErr?.body || pushErr?.message || 'unknown error')
            failures.push({ status, reason })
            console.error(`[test-push] send to ${sub.endpoint} failed (${status ?? 'n/a'}): ${reason}`)
            if (status === 404 || status === 410) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id)
            }
          }
        }

        console.log(`[test-push] user=${testUserId} devices=${subscriptions.length} sent=${sent} failed=${failures.length}`)
        return { sent, failures }
      }

      if (delaySeconds > 0) {
        // Delayed variant: answer straight away and push from the background, so
        // closing the app right after pressing the button cannot cut the send off.
        const { subscriptions, error } = await loadTestSubscriptions()

        if (error || subscriptions.length === 0) {
          return jsonResponse({
            message: error ?? 'No subscriptions found for user',
            scheduled: false,
            subscriptions: 0,
            sent: 0,
            failures: error ? [{ status: null, reason: error }] : []
          })
        }

        const delayMs = Math.min(Math.max(delaySeconds, 1), MAX_PUSH_DELAY_SECONDS) * 1000
        const runtime = backgroundRuntime()

        if (runtime) {
          runtime.waitUntil(
            (async () => {
              await sleep(delayMs)
              await deliverTestPush(subscriptions)
            })().catch((err) => console.error('[test-push] background send failed:', err))
          )
          return jsonResponse({
            message: 'Test push scheduled',
            scheduled: true,
            delaySeconds,
            subscriptions: subscriptions.length,
            sent: 0,
            failures: []
          })
        }

        // No background runtime available: fall back to the old blocking path so
        // the push still goes out as long as the caller keeps the request open.
        await sleep(delayMs)
        const { sent, failures } = await deliverTestPush(subscriptions)
        return jsonResponse({
          message: 'Test push processed',
          scheduled: true,
          delaySeconds,
          subscriptions: subscriptions.length,
          sent,
          failures
        })
      }

      const { subscriptions, error } = await loadTestSubscriptions()

      if (error) {
        return jsonResponse({ message: error, subscriptions: 0, sent: 0, failures: [{ status: null, reason: error }] })
      }
      if (subscriptions.length === 0) {
        return jsonResponse({ message: 'No subscriptions found for user', subscriptions: 0, sent: 0, failures: [] })
      }

      const { sent, failures } = await deliverTestPush(subscriptions)
      return jsonResponse({
        message: sent > 0 ? 'Test push processed' : 'Test push could not be delivered',
        scheduled: false,
        subscriptions: subscriptions.length,
        sent,
        failures
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
      return jsonResponse({ message: 'No reminders due', processed: 0, sent: 0 })
    }

    let sentCount = 0
    const retried: number[] = []
    const details: Array<Record<string, unknown>> = []

    /** Hands an undelivered reminder back to the next run instead of dropping it. */
    const releaseReminderClaim = async (todoId: number) => {
      await supabase.from('todos').update({ reminder_sent_at: null }).eq('id', todoId)
    }

    for (const { todo, shouldSendPush } of eligibleTodos) {
      // Claim the reminder first so two overlapping runs cannot both deliver it,
      // and release the claim again below whenever nothing could be delivered: a
      // push that fails has to be retried by the next run instead of being
      // swallowed (this used to mark the reminder sent even when no device
      // received anything, which lost it for good).
      await supabase
        .from('todos')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', todo.id)

      if (!shouldSendPush) {
        // Older than the 24h window the push services keep messages for: stop
        // retrying and just retire it.
        details.push({ todoId: todo.id, status: 'expired', devices: 0, sent: 0 })
        continue
      }

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

      if (recipientIds.size === 0) {
        details.push({ todoId: todo.id, status: 'no-recipients', devices: 0, sent: 0 })
        continue
      }

      // Look up push subscriptions for all resolved recipients
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
        // Nobody has a device registered (yet): keep the reminder pending so it
        // goes out as soon as one registers, for as long as the push window lasts.
        await releaseReminderClaim(todo.id)
        retried.push(todo.id)
        details.push({ todoId: todo.id, status: 'no-devices', recipients: recipientIds.size, devices: 0, sent: 0 })
        continue
      }

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

      let delivered = 0
      const failures: Array<{ status: number | null; reason: string }> = []

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
            payload,
            {
              TTL: 86400,
              urgency: 'high',
              topic: `todo-${todo.id}`.slice(0, 32),
              headers: pushHeadersFor(sub.endpoint)
            }
          )
          delivered++
        } catch (pushErr: any) {
          const status = pushErr?.statusCode ?? null
          const reason = String(pushErr?.body || pushErr?.message || 'unknown error')
          failures.push({ status, reason })
          console.error(`[send-reminders] todo ${todo.id}: push to ${sub.endpoint} failed (${status ?? 'n/a'}): ${reason}`)
          if (status === 404 || status === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }

      if (delivered > 0) {
        sentCount += delivered
        details.push({ todoId: todo.id, status: 'delivered', recipients: recipientIds.size, devices: subscriptions.length, sent: delivered })
      } else {
        await releaseReminderClaim(todo.id)
        retried.push(todo.id)
        console.error(`[send-reminders] todo ${todo.id}: no device could be reached (${subscriptions.length} tried); reminder kept pending for the next run`)
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
    console.error('[send-reminders] failed:', err?.message || err)
    return jsonResponse({ error: err.message }, 500)
  }
})
