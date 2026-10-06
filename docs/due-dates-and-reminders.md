# Due dates and reminders — plan

Planned as its own piece of work, not started. Everything below is grounded in the
code as it stands today; the file names are the actual touchpoints.

Today an activity is `id, title, completed, group_name, created_at, user_id` — there
is no notion of *when* something is due, so there is nothing a reminder could be
about. That is why this is a data-model change first and a notification feature
second.

## What the user gets, in order of when it can ship

| Phase | Outcome | Needs |
| --- | --- | --- |
| 1 | Set a due date/time on an activity, see it as a chip ("Oggi 18:00", "In ritardo"), sort and filter by it | schema + UI |
| 2 | The app *surfaces* what is due: a "In scadenza" filter, overdue styling, an icon badge that counts what is late, a "Scadenza" block in the detail dialog | phase 1 |
| 3 | A device notification when something is due — and optionally when someone else adds or changes an activity in a shared list | phase 2 + push infrastructure |

Phases 1–2 are entirely client + one migration. Phase 3 is a real backend piece and
also unlocks "Marco added X to Lavoro" notifications, which is the feature that makes
a *shared* list feel alive.

## Phase 1 — data model

Append to `supabase/schema.sql` (the file is idempotent by design — re-running it is
the migration):

```sql
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS due_all_day BOOLEAN NOT NULL DEFAULT FALSE;
-- lead time in minutes before due_at (null = no reminder); 0 = at the due time
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER;
-- set by the sender once it has notified, so a reminder is never sent twice
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
-- the timezone the reminder time was written in: `due_at` is UTC, but "9 del mattino"
-- only means something with a zone, and the sender has no browser to ask
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS timezone TEXT;
```

```sql
CREATE INDEX IF NOT EXISTS idx_todos_due_at
  ON public.todos (due_at)
  WHERE due_at IS NOT NULL AND completed = FALSE;
```

Notes:

- **No RLS change is needed for reads or writes**: the existing policies are row-level
  and column-agnostic (`"Users can view own or shared todos"` etc., `supabase/schema.sql:415+`),
  so a due date is covered by them. The `UPDATE` policy still requires the `edit`
  permission for shared groups, which is exactly right — a read-only share must not be
  able to move someone else's deadline.
- **`due_at` is UTC**; the UI renders it in the device's zone (`Intl.DateTimeFormat`),
  and `timezone` is stored so the *sender* can decide what "08:00" meant.
- **All-day vs timed** matters for both display and midnight math; `due_all_day` keeps
  them apart instead of guessing from `00:00`.

## Phase 2 — UI touchpoints

| File | Change |
| --- | --- |
| `app/components/TodoInput.vue` | a due-date control next to the group picker: quick chips (Oggi, Domani, +1 settimana) + a native `<input type="date">`/`time`; on mobile prefer the OS picker over a custom calendar |
| `app/components/TodoDetailModal.vue` | a "Scadenza" row in the `<dl>` next to Creata/Stato, editable there |
| `app/components/TodoItem.vue` | a due chip in the meta row, next to the group chip: neutral, `text-amber-*` when today, `text-red-*` when overdue; reuse `formatDate`-style helpers |
| `app/utils/date.ts` | `dueLabel(dueAt, allDay)` + `dueBucket(dueAt)` → `overdue \| today \| soon \| later` as **pure functions**, so they can be unit-tested with `node --test` the way `composeShareDraft` is |
| `app/composables/useTodos.ts` | `sortTodos` gains `due-asc`; `filteredTodos` gains a `due` filter; `scopedStats` gains `overdue`/`today` counts |
| `app/composables/usePreferences.ts` | `SORT_ORDERS` gains "Scadenza più vicina"; optionally a `defaultReminderMinutes` preference |
| `app/components/TodoFilters.vue` | a "Scadenza" tab or chip ("In scadenza N") |
| `app/composables/useAppBadge.ts` | decide what the badge counts: today it is `stats.active`; overdue+due-today is the more useful number once dates exist |
| `app/pages/index.vue`, `app/pages/g/[group].vue` | nothing structural — they already delegate to `WorkspaceView` |
| `app/pages/share.vue` | when shared content looks like a date/time, offer it as the due date instead of only the title |

Migration of the existing UI is deliberately small: the row, the dialog, the filters
and the sort are all driven by data already fetched with `select('*')`, so no query
change is needed for phase 2.

## Phase 3 — actually notifying

### Delivery options, honestly

| Option | Works on | Verdict |
| --- | --- | --- |
| In-app only (badge + "In scadenza" + a dot on the row) | everywhere, no permission | phase 2, ship it regardless |
| Local notification fired while the app is open | everywhere the app runs | weak: only helps if you already opened the app |
| Periodic Background Sync + local notification | Chromium, installed only | unreliable (needs site engagement, no iOS) — not a plan |
| **Web Push** | Android/desktop Chrome, iOS 16.4+ *installed*, Safari 16.4+ macOS | the only dependable option |

### What push needs

1. **A custom service worker.** Today the build is `generateSW` (see `nuxt.config.ts`):
   no place to put a `push` handler. Switch to `injectManifest` with an `app/sw.ts`
   that keeps the existing precache/runtime-caching rules and adds `push` +
   `notificationclick`. The current behaviour to preserve: `NetworkOnly` for
   `*.supabase.co`, `NetworkFirst` for navigations, `StaleWhileRevalidate` for
   assets, `CacheFirst` for images, and the `globIgnores` that keep `/splash` and
   `/screenshots` out of the precache.
2. **A subscription table**, RLS-restricted to the owner:

   ```sql
   CREATE TABLE IF NOT EXISTS public.push_subscriptions (
     id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
     user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
     endpoint TEXT NOT NULL UNIQUE,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     user_agent TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     last_seen_at TIMESTAMPTZ DEFAULT NOW(),
     failure_count INTEGER NOT NULL DEFAULT 0
   );
   ```
   `endpoint` is unique because the same phone re-subscribes with the same endpoint;
   `failure_count` is how dead subscriptions get pruned (404/410 from the push
   service).
3. **VAPID keys**: public key in the client (`NUXT_PUBLIC_VAPID_PUBLIC_KEY`), private
   key as an Edge Function secret — never in the repo or the client bundle.
4. **A sender**: a Supabase Edge Function (Deno) on a schedule (`pg_cron` →
   `net.http_post`, or Supabase's scheduled functions). Per run:
   - claim work atomically so two runs cannot double-notify:
     `UPDATE public.todos SET reminder_sent_at = now() WHERE reminder_sent_at IS NULL AND completed = FALSE AND due_at - (reminder_minutes * interval '1 minute') <= now() AND reminder_minutes IS NOT NULL RETURNING ...`
   - expand each claimed row to its recipients: the owner **plus** the share holders
     of that group (the predicate in `todo_shares`: `shared_with_id` or the matching
     `shared_with_email`, with `group_name IS NULL` meaning the whole list);
   - look up those users' `push_subscriptions` and send with `web-push`;
   - delete subscriptions that answer 404/410.
   - The function uses the **service role** (it must read other users' rows); that key
     exists only in the function's environment.
5. **Permission, asked at the right moment.** `Notification.requestPermission()` and
   `pushManager.subscribe()` must run inside a user gesture — so ask when the user sets
   their *first* reminder ("Vuoi che ti avvisi?"), never on load. A "Notifiche" section
   in `app/components/SettingsModal.vue` lets them turn it off (and shows the state
   when the browser has blocked it — no prompt can be shown twice).

### Sharing and who gets told

Two different events, one infrastructure:

- **Due reminder** — everyone who can see the activity (owner + recipients of that
  group). Open question: recipients with `read` permission but no stake in the work
  may not want it — see the decisions below.
- **Activity change** — "Marco ha aggiunto …" to the other members of the group.
  This is an INSERT/UPDATE webhook on `todos` rather than a cron query, and needs the
  same subscription lookup.

Both should be able to open the item: a notification click should land on the activity
itself, i.e. `/?todo=<id>` (or `/g/<group>?todo=<id>`), and `WorkspaceView` should read
that param and open `TodoDetailModal` for it. Without that, a notification only opens
the app and makes the user hunt for what it was about.

### Reminders and time

- `due_at` is UTC; `timezone` is the zone the reminder was written in. "Ricordamelo alle
  9" means 09:00 *in that zone*, on the day it falls due.
- DST: a reminder set for 09:00 local must stay 09:00 local after a DST shift — with
  `due_at` UTC + `timezone` this is a recomputation, not a stored offset.
- A cron that runs every 5 minutes needs a small grace window (`due_at - lead <= now()`
  with a floor of "not more than an hour late"), otherwise a delayed run sends a
  reminder for something from this morning.
- Completed (`completed = true`) and deleted activities must never notify.

## Decisions to take before phase 3

1. Who receives a due reminder: only the owner, or everyone who can see the group
   (including read-only shares)?
2. Does the reminder go at the due time, at a lead time (default 30 minutes?), or both?
3. All-day activities: notify in the morning (which hour?) or not at all?
4. Do we want "someone changed a shared list" notifications at all, or only reminders?
   They are the louder, more addictive half of the feature.
5. Is a Supabase Edge Function + `pg_cron` acceptable for the sending side, or should
   the reminder go out from somewhere else you already run?

## Risks

| Risk | Mitigation |
| --- | --- |
| Notification fatigue → users disable them | one notification per activity, opt-in per device, cap the daily count, batch "3 attività scadono oggi" |
| Double notifications | atomic claim on `reminder_sent_at`; the sender is safe to re-run |
| Timezone/DST bugs | pure `dueBucket`/`dueLabel` functions with unit tests (midnight, DST, far zones) |
| Dead subscriptions | prune on 404/410; `last_seen_at` refreshed on every app start |
| iOS silently not delivering | iOS requires an installed PWA (16.4+) and permission from a gesture; test on a real device, and keep the in-app surfacing as the fallback that always works |
| Permission prompt refused permanently | never prompt on load; the settings section explains and shows the blocked state |
| Cost/spam from the scheduler | the cron only queries rows with `reminder_minutes IS NOT NULL AND reminder_sent_at IS NULL`, over the partial index above |
| Read-only share recipient gets nagged | see decision 1 |

## Verification plan

- Unit tests (`node --test`, as with `composeShareDraft`): `dueBucket` (overdue / today /
  soon / later / all-day / no date), and the reminder-window computation.
- RLS: two accounts, one share row — the recipient can read the shared due date and
  cannot move it without `edit`.
- Sender: run it twice for the same row → exactly one notification, one
  `reminder_sent_at`; completed and deleted rows send nothing.
- Timezone: a reminder set in a different device zone still fires at the intended local
  time; DST week.
- Devices: Android Chrome installed + not installed, iOS installed (16.4+), Safari
  macOS — and the refusal path on each.
- Regression: the pieces already shipped must keep working — launch screens and
  `/share` are unaffected, but the switch to `injectManifest` re-tests the whole
  offline story (precache, navigate fallback, `NetworkOnly` for Supabase).
