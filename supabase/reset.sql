-- ==============================================================================
-- supabase/reset.sql — ShareToDo: database reset & cleanup helpers
-- ------------------------------------------------------------------------------
-- WHERE TO RUN
--   Supabase Dashboard -> SQL Editor. It executes as a privileged role.
--   The app's publishable/anon key CANNOT delete auth users or other owners'
--   rows, so this cannot be done from the app or from `npm run dev`.
--
-- HOW TO USE
--   1. Read section 1 — it is read-only and always reports current state.
--   2. Set `op` in section 2 to the operation you want, then run the file.
--   3. Set `target_email` if you use 'delete_user'.
--   `op` defaults to 'inspect', which deletes NOTHING.
--
-- OPERATIONS
--   'inspect'              read section 1 only (default, safe) — no-op here
--   'delete_user'          delete ONE user by email, plus their todos/shares
--   'cleanup_orphans'      delete todos with user_id IS NULL (pre-auth leftovers)
--   'wipe_data'            delete ALL todos + shares, keep every user
--   'wipe_data_and_users'  delete ALL todos + shares + every auth user
--   'drop_schema'          drop the app tables/trigger; then re-run schema.sql
--
-- ⚠️  Everything except 'inspect' is IRREVERSIBLE.
--     Take a backup first: Dashboard -> Database -> Backups.
-- ==============================================================================


-- ==============================================================================
-- 1. INSPECT (read-only — always safe to run)
-- ==============================================================================

-- Who exists?
select id, email, created_at, last_sign_in_at
from auth.users
order by created_at desc;

-- How much data is there?
select
  (select count(*) from public.todos)                              as todos,
  (select count(*) from public.todo_shares)                        as todo_shares,
  (select count(*) from public.todos where user_id is null)        as orphaned_todos,
  (select count(*) from auth.users)                                as users;

-- Per-user todo breakdown (helps confirm which rows belong to whom)
select
  u.id,
  u.email,
  count(t.id) as todo_count
from auth.users u
left join public.todos t on t.user_id = u.id
group by u.id, u.email
order by todo_count desc;


-- ==============================================================================
-- 2. THE GUARDED OPERATION
-- ==============================================================================

do $$
declare
  -- ⚙️ Pick ONE operation. Default is a no-op so running this file changes nothing.
  op           text := 'inspect';
  -- ⚙️ Only used by 'delete_user'.
  target_email text := 'you@example.com';

  target_id    uuid;
  affected     bigint;
begin
  if op = 'inspect' then
    raise notice 'op = ''inspect'' — nothing deleted. See the SELECTs above.';

  -- ---------------------------------------------------------------------------
  elsif op = 'delete_user' then
    select id into target_id
    from auth.users
    where lower(email) = lower(target_email);

    if target_id is null then
      raise exception 'delete_user: no auth user with email %', target_email;
    end if;

    -- Rows owned by the user (the FK is ON DELETE CASCADE, this is explicit anyway)
    delete from public.todos
    where user_id = target_id;
    get diagnostics affected = row_count;
    raise notice 'deleted % todo(s) owned by %', affected, target_email;

    delete from public.todo_shares
    where owner_id = target_id or shared_with_id = target_id;
    get diagnostics affected = row_count;
    raise notice 'deleted % share(s) touching %', affected, target_email;

    delete from auth.users
    where id = target_id;
    raise notice 'deleted auth user % (%)', target_email, target_id;

  -- ---------------------------------------------------------------------------
  elsif op = 'cleanup_orphans' then
    delete from public.todos
    where user_id is null;
    get diagnostics affected = row_count;
    raise notice 'deleted % orphaned todo(s) with user_id IS NULL', affected;

  -- ---------------------------------------------------------------------------
  elsif op = 'wipe_data' then
    truncate table public.todo_shares, public.todos restart identity cascade;
    raise notice 'truncated public.todo_shares + public.todos (users kept)';

  -- ---------------------------------------------------------------------------
  elsif op = 'wipe_data_and_users' then
    delete from public.todo_shares;
    get diagnostics affected = row_count;
    raise notice 'deleted % share(s)', affected;

    delete from public.todos;
    get diagnostics affected = row_count;
    raise notice 'deleted % todo(s)', affected;

    delete from auth.users;
    get diagnostics affected = row_count;
    raise notice 'deleted % auth user(s)', affected;

  -- ---------------------------------------------------------------------------
  elsif op = 'drop_schema' then
    drop trigger if exists on_auth_user_created_shares on auth.users;
    drop function if exists public.handle_new_user_shares() cascade;
    drop table if exists public.todo_shares cascade;
    drop table if exists public.todos cascade;
    raise notice 'dropped app tables + trigger. Now re-run supabase/schema.sql.';

  -- ---------------------------------------------------------------------------
  else
    raise exception 'Unknown op: %', op;
  end if;
end $$;
