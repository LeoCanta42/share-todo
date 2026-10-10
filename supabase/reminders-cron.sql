-- =====================================================================
-- Configurazione pg_cron per invio automatico dei promemoria con Supabase
-- =====================================================================
-- 
-- Questo script permette a Supabase di invocare la Edge Function `send-reminders`
-- ogni 2 o 5 minuti in background, per inviare le notifiche push anche quando
-- l'app non è aperta su alcun dispositivo.
--
-- Prerequisiti:
-- 1. Nel Supabase Dashboard > Database > Extensions, abilita:
--    - pg_cron
--    - pg_net
-- 2. Distribuisci la Edge Function:
--    supabase functions deploy send-reminders --no-verify-jwt
-- 3. Imposta i segreti della Edge Function:
--    supabase secrets set VAPID_PUBLIC_KEY="la_tua_chiave_pubblica"
--    supabase secrets set VAPID_PRIVATE_KEY="la_tua_chiave_privata"
--    supabase secrets set VAPID_SUBJECT="https://tuodominio.it"

-- Schedulazione del cron job ogni minuto:
-- Rimuove eventuale vecchio job prima di ricrearlo
SELECT cron.unschedule('send-reminders-job') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-reminders-job');

SELECT cron.schedule(
  'send-reminders-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://newhtivqunqtjswkxwhp.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Per verificare i cron job attivi:
-- SELECT * FROM cron.job;

-- Per visualizzare lo storico delle esecuzioni:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Per rimuovere il cron job:
-- SELECT cron.unschedule('send-reminders-job');
