/*
Run once per storage organization_id (the transcript owner's user ID).
The scheduler supplies organizationId and lookbackDays query parameters.
Every returned violation_count must be zero.
*/
WITH
  {organizationId:String} AS scoped_organization_id,
  {lookbackDays:UInt32} AS scoped_lookback_days
SELECT
  'claude_input_includes_cache' AS invariant,
  countIf(input_tokens < cache_read_input_tokens + cache_creation_input_tokens) AS violation_count
FROM rudel.session_analytics FINAL
WHERE source = 'claude_code'
  AND organization_id = scoped_organization_id
  AND session_date >= now64(3) - toIntervalDay(scoped_lookback_days)

UNION ALL

SELECT
  'codex_cache_read_is_input_subset' AS invariant,
  countIf(cache_read_input_tokens > input_tokens) AS violation_count
FROM rudel.session_analytics FINAL
WHERE source = 'codex'
  AND organization_id = scoped_organization_id
  AND session_date >= now64(3) - toIntervalDay(scoped_lookback_days)

UNION ALL

SELECT
  'codex_has_no_cache_creation_class' AS invariant,
  countIf(cache_creation_input_tokens != 0) AS violation_count
FROM rudel.session_analytics FINAL
WHERE source = 'codex'
  AND organization_id = scoped_organization_id
  AND session_date >= now64(3) - toIntervalDay(scoped_lookback_days)

UNION ALL

SELECT
  'total_is_input_plus_output' AS invariant,
  countIf(total_tokens != input_tokens + output_tokens) AS violation_count
FROM rudel.session_analytics FINAL
WHERE source IN ('claude_code', 'codex')
  AND organization_id = scoped_organization_id
  AND session_date >= now64(3) - toIntervalDay(scoped_lookback_days)

UNION ALL

SELECT
  'reupload_final_identity_is_idempotent' AS invariant,
  countIf(ifNull(analytics.final_rows, 0) != 1) AS violation_count
FROM
(
  SELECT source, organization_id, user_id, session_id
  FROM
  (
    SELECT
      'claude_code' AS source,
      organization_id,
      user_id,
      session_id
    FROM rudel.claude_sessions
    WHERE organization_id = scoped_organization_id
      AND session_date >= now64(3) - toIntervalDay(scoped_lookback_days)
    GROUP BY organization_id, user_id, session_id
    HAVING count() > 1

    UNION ALL

    SELECT
      'codex' AS source,
      organization_id,
      user_id,
      session_id
    FROM rudel.codex_sessions
    WHERE organization_id = scoped_organization_id
      AND session_date >= now64(3) - toIntervalDay(scoped_lookback_days)
    GROUP BY organization_id, user_id, session_id
    HAVING count() > 1
  )
) AS reuploaded
LEFT ANY JOIN
(
  SELECT
    source,
    organization_id,
    user_id,
    session_id,
    count() AS final_rows
  FROM rudel.session_analytics FINAL
  WHERE source IN ('claude_code', 'codex')
    AND organization_id = scoped_organization_id
    AND session_date >= now64(3) - toIntervalDay(scoped_lookback_days)
  GROUP BY source, organization_id, user_id, session_id
) AS analytics
USING (source, organization_id, user_id, session_id)

SETTINGS
  max_execution_time = 30,
  timeout_before_checking_execution_speed = 0,
  max_rows_to_read = 1000000000,
  max_bytes_to_read = 100000000000,
  max_result_rows = 10;
