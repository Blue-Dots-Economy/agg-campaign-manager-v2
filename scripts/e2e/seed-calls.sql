-- Sample call data for the local e2e stack. Every row is tagged batch_id = 'seed-local'.
-- Re-runnable: it deletes its own rows first.
BEGIN;
DELETE FROM purple_dots_calls WHERE batch_id = 'seed-local';
SELECT setseed(0.42);

-- Seekers: 8 days x ~80 calls, 3 campaigns.
WITH base AS (
  SELECT g AS n,
         (current_date - 13 + ((g - 1) / 80))::date AS d,
         (ARRAY['Seekers - Hubli outreach','Seekers - Ghaziabad outreach','Seekers - Follow-up'])[1 + (g % 3)] AS camp,
         random() AS r1, random() AS r2, random() AS r3, random() AS r4
  FROM generate_series(1, 640) g
), shaped AS (
  SELECT *,
    r1 < 0.62 AS answered,
    r1 < 0.62 AND r2 < 0.70 AS engaged
  FROM base
), staged AS (
  SELECT *,
    CASE WHEN NOT answered THEN NULL
         WHEN NOT engaged THEN 'Phase 1: Silent profile fetch and name confirmation'
         ELSE (ARRAY['Phase 2: Profile completion','Phase 3: Identify the disability type',
                     'Phase 4: Needs & challenges evaluation','Phase 5: Options delivery and decision',
                     'Phase 6: Summary & profile update','Phase 7: Match provider','Phase 8: Connect to provider'])
              [1 + floor(r3 * 7)::int] END AS stage
  FROM shaped
)
INSERT INTO purple_dots_calls (
  call_id, call_uuid, batch_id, campaign_name, agent_id, agent_name, persona, channel,
  contact_reference_type, contact_reference, contact_id, call_date_ist, call_datetime_ist,
  call_duration_seconds, contact_attempts, call_status, call_answered, call_engaged,
  call_dropped_abruptly, full_journey_completed, abandoned_at_stage, solution_enablers_discussed,
  matching_providers_found, connect_provider_api_triggered, connect_provider_api_successful,
  providers_connected, call_value_score, drop_reason, test_flag)
SELECT
  'seed-s-' || lpad(n::text, 4, '0'), gen_random_uuid()::text, 'seed-local', camp,
  'agent-seekers-01', 'Seeker voice agent', 'seeker', CASE WHEN n % 10 = 0 THEN 'inbound' ELSE 'outbound' END,
  'sample', 'sample-' || n, 'SAMPLE-S-' || lpad(n::text, 4, '0'), d,
  d + time '10:00' + (n % 80) * interval '6 minutes',
  CASE WHEN NOT answered THEN 0 WHEN NOT engaged THEN 8 + floor(r4 * 25) ELSE 60 + floor(r4 * 420) END,
  1 + (n % 3),
  CASE WHEN answered AND stage LIKE 'Phase 8%' THEN 'completed' WHEN answered THEN 'answered'
       WHEN r1 < 0.85 THEN 'no_answer' WHEN r1 < 0.95 THEN 'busy' ELSE 'failed' END,
  answered, engaged,
  answered AND NOT engaged,
  stage LIKE 'Phase 8%',
  stage,
  engaged AND r3 > 0.3,
  CASE WHEN stage ~ 'Phase [78]' THEN 1 + floor(r4 * 5)::int ELSE 0 END,
  stage LIKE 'Phase 8%',
  stage LIKE 'Phase 8%' AND r4 > 0.2,
  CASE WHEN stage LIKE 'Phase 8%' AND r4 > 0.2 THEN 1 + floor(r2 * 3)::int ELSE 0 END,
  CASE WHEN NOT answered THEN NULL ELSE round((CASE WHEN engaged THEN 3 + r3 * 7 ELSE r3 * 4 END)::numeric, 1) END,
  CASE WHEN NOT answered OR stage LIKE 'Phase 8%' THEN NULL
       ELSE (ARRAY['early_hangup','user_declined','no_matching_jobs','apply_failed','profile_loop','other'])[1 + floor(r2 * 6)::int] END,
  false
FROM staged;

-- Providers: 6 days x 25 calls, 2 campaigns.
WITH base AS (
  SELECT g AS n,
         (current_date - 11 + ((g - 1) / 25) * 2)::date AS d,
         (ARRAY['Providers - Job verification','Providers - New postings'])[1 + (g % 2)] AS camp,
         random() AS r1, random() AS r2, random() AS r3
  FROM generate_series(1, 150) g
)
INSERT INTO purple_dots_calls (
  call_id, call_uuid, batch_id, campaign_name, agent_id, agent_name, persona, channel,
  contact_reference_type, contact_reference, contact_id, call_date_ist, call_datetime_ist,
  call_duration_seconds, contact_attempts, call_status, call_answered, call_engaged,
  call_value_score, drop_reason, test_flag)
SELECT
  'seed-p-' || lpad(n::text, 4, '0'), gen_random_uuid()::text, 'seed-local', camp,
  'agent-providers-01', 'Provider voice agent', 'provider', 'outbound',
  'sample', 'sample-p-' || n, 'SAMPLE-P-' || lpad(n::text, 4, '0'), d,
  d + time '11:00' + (n % 25) * interval '9 minutes',
  CASE WHEN r1 < 0.55 THEN 40 + floor(r3 * 300) WHEN r1 < 0.65 THEN 10 + floor(r3 * 20) ELSE 0 END,
  1 + (n % 2),
  CASE WHEN r1 < 0.40 THEN 'completed' WHEN r1 < 0.65 THEN 'answered' WHEN r1 < 0.88 THEN 'no_answer' ELSE 'failed' END,
  r1 < 0.65, r1 < 0.55,
  CASE WHEN r1 < 0.65 THEN round((r2 * 10)::numeric, 1) END,
  CASE WHEN r1 < 0.40 THEN 'Completed' WHEN r1 < 0.55 THEN 'Callback Requested' WHEN r1 < 0.65 THEN 'Early Disconnect'
       WHEN r1 < 0.88 THEN 'No Answer' ELSE 'Failure' END,
  false
FROM base;

-- Provider connections for seekers who were connected.
INSERT INTO purple_dots_connections (call_id, seeker_item_id, provider_item_id, consent_acknowledged, consent_version)
SELECT c.call_id, 'sample-seeker-' || c.call_id, 'sample-provider-' || k, true, 1
FROM purple_dots_calls c, generate_series(1, 3) k
WHERE c.batch_id = 'seed-local' AND k <= COALESCE(c.providers_connected, 0);

COMMIT;
SELECT program, count(*) AS calls, count(*) FILTER (WHERE call_answered) AS answered FROM call_rows GROUP BY 1;
