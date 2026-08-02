-- chkit-migration-format: v1
-- generated-at: 2026-08-02T13:32:13.112Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 7
-- operation-count: 15
-- rename-suggestion-count: 0
-- risk-summary: safe=4, caution=4, danger=0
-- manual-precondition: Quiesce all session ingest before applying this migration.
-- manual-precondition: Apply this migration to production before merging API/web consumers.

-- operation: drop_materialized_view key=materialized_view:rudel.codex_session_analytics_mv risk=caution
DROP TABLE IF EXISTS rudel.codex_session_analytics_mv SYNC;

-- operation: drop_materialized_view key=materialized_view:rudel.session_analytics_mv risk=caution
DROP TABLE IF EXISTS rudel.session_analytics_mv SYNC;

-- operation: alter_table_add_column key=table:rudel.session_analytics:column:cache_creation_1h_input_tokens risk=safe
ALTER TABLE rudel.session_analytics ADD COLUMN IF NOT EXISTS `cache_creation_1h_input_tokens` UInt64 DEFAULT 0;

-- operation: alter_table_add_column key=table:rudel.session_analytics:column:cache_creation_5m_input_tokens risk=safe
ALTER TABLE rudel.session_analytics ADD COLUMN IF NOT EXISTS `cache_creation_5m_input_tokens` UInt64 DEFAULT 0;

-- operation: alter_table_add_column key=table:rudel.session_analytics:column:is_capped risk=safe
ALTER TABLE rudel.session_analytics ADD COLUMN IF NOT EXISTS `is_capped` UInt8 DEFAULT 0;

-- operation: alter_table_add_column key=table:rudel.session_analytics:column:stale_extraction risk=safe
ALTER TABLE rudel.session_analytics ADD COLUMN IF NOT EXISTS `stale_extraction` UInt8 DEFAULT 0;

-- manual-operation: preserve analytics whose raw transcript has expired
-- These rows cannot be recounted after the 365-day raw TTL. Write a newer
-- version that preserves every known value, assigns the legacy flat cache-write
-- count to the 5-minute bucket, and makes the uncertainty queryable.
INSERT INTO rudel.session_analytics
(
  `session_date`,
  `last_interaction_date`,
  `session_id`,
  `organization_id`,
  `project_path`,
  `git_remote`,
  `package_name`,
  `package_type`,
  `filter_version`,
  `ingested_at`,
  `user_id`,
  `git_branch`,
  `git_sha`,
  `tag`,
  `source`,
  `skills`,
  `slash_commands`,
  `subagent_types`,
  `input_tokens`,
  `output_tokens`,
  `cache_read_input_tokens`,
  `cache_creation_input_tokens`,
  `cache_creation_5m_input_tokens`,
  `cache_creation_1h_input_tokens`,
  `total_tokens`,
  `is_capped`,
  `stale_extraction`,
  `total_interactions`,
  `actual_duration_min`,
  `avg_period_sec`,
  `median_period_sec`,
  `quick_responses`,
  `normal_responses`,
  `long_pauses`,
  `error_count`,
  `error_pattern`,
  `model_used`,
  `has_commit`,
  `session_archetype`,
  `success_score`,
  `used_plan_mode`,
  `inference_duration_sec`,
  `human_duration_sec`
)
SETTINGS async_insert=0
SELECT
  analytics.session_date,
  analytics.last_interaction_date,
  analytics.session_id,
  analytics.organization_id,
  analytics.project_path,
  analytics.git_remote,
  analytics.package_name,
  analytics.package_type,
  analytics.filter_version,
  greatest(now64(3), analytics.ingested_at + toIntervalMillisecond(1)),
  analytics.user_id,
  analytics.git_branch,
  analytics.git_sha,
  analytics.tag,
  analytics.source,
  analytics.skills,
  analytics.slash_commands,
  analytics.subagent_types,
  analytics.input_tokens,
  analytics.output_tokens,
  analytics.cache_read_input_tokens,
  analytics.cache_creation_input_tokens,
  analytics.cache_creation_input_tokens,
  toUInt64(0),
  analytics.total_tokens,
  analytics.is_capped,
  toUInt8(1),
  analytics.total_interactions,
  analytics.actual_duration_min,
  analytics.avg_period_sec,
  analytics.median_period_sec,
  analytics.quick_responses,
  analytics.normal_responses,
  analytics.long_pauses,
  analytics.error_count,
  analytics.error_pattern,
  analytics.model_used,
  analytics.has_commit,
  analytics.session_archetype,
  analytics.success_score,
  analytics.used_plan_mode,
  analytics.inference_duration_sec,
  analytics.human_duration_sec
FROM
(
  SELECT *
  FROM rudel.session_analytics FINAL
) AS analytics
LEFT ANTI JOIN
(
  SELECT
    'claude_code' AS source,
    organization_id,
    user_id,
    session_id
  FROM rudel.claude_sessions
  GROUP BY source, organization_id, user_id, session_id

  UNION ALL

  SELECT
    'codex' AS source,
    organization_id,
    user_id,
    session_id
  FROM rudel.codex_sessions
  GROUP BY source, organization_id, user_id, session_id
) AS raw
USING (source, organization_id, user_id, session_id);

-- operation: create_materialized_view key=materialized_view:rudel.codex_session_analytics_mv risk=caution
CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.codex_session_analytics_mv TO rudel.session_analytics AS
SELECT * EXCEPT (_dedupe_rank) FROM ( WITH ( length(cs.content) > 167772160 OR countSubstrings(cs.content, '\n') > 100000 ) AS _is_capped, arraySlice( splitByChar( '\n', substring(cs.content, 1, 167772160) ), 1, 100000 ) AS _all_lines, substring(cs.content, 1, 20000000) AS _error_sample_content, arrayFilter( x -> isNotNull(x.2), arrayMap( x -> tuple( x, parseDateTime64BestEffortOrNull(JSONExtractString(x, 'timestamp')) ), _all_lines ) ) AS _timestamped_lines, arrayMap(x -> assumeNotNull(x.2), _timestamped_lines) AS _timestamps, if( length(_timestamps) > 1, arrayMap( i -> greatest( dateDiff('second', _timestamps[i], _timestamps[i + 1]), 0 ), range(1, length(_timestamps)) ), [] ) AS _prompt_periods_sec, if( length(_timestamps) > 1, arrayMap( i -> greatest( dateDiff('second', _timestamps[i], _timestamps[i + 1]), 0 ), range(1, length(_timestamps)) ), [] ) AS _inference_gaps, arrayFilter( x -> JSONExtractString(x, 'type') IN ('response_item', 'event_msg'), _all_lines ) AS _interaction_lines, arrayFilter( x -> JSONExtractString(x, 'type') = 'response_item' AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output', _all_lines ) AS _tool_output_lines, arrayFilter( x -> JSONExtractString(x, 'type') = 'event_msg' AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count' AND JSONHas(JSONExtractRaw(x, 'payload'), 'info') AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null' AND JSONHas( JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'), 'total_token_usage' ) AND JSONHas( JSONExtractRaw( JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'), 'total_token_usage' ), 'input_tokens' ) AND JSONHas( JSONExtractRaw( JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'), 'total_token_usage' ), 'output_tokens' ) AND JSONHas( JSONExtractRaw( JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'), 'total_token_usage' ), 'cached_input_tokens' ), _all_lines ) AS _token_count_lines, arrayMap( line -> JSONExtractRaw( JSONExtractRaw(JSONExtractRaw(line, 'payload'), 'info'), 'total_token_usage' ), _token_count_lines ) AS _usage_objects, arrayMap( usage -> tuple( toUInt64OrZero(JSONExtractRaw(usage, 'input_tokens')), toUInt64OrZero(JSONExtractRaw(usage, 'cached_input_tokens')), toUInt64OrZero(JSONExtractRaw(usage, 'output_tokens')) ), _usage_objects ) AS _usage_snapshots, arrayFilter( i -> i > 1 AND ( _usage_snapshots[i].1 < _usage_snapshots[i - 1].1 OR _usage_snapshots[i].2 < _usage_snapshots[i - 1].2 OR _usage_snapshots[i].3 < _usage_snapshots[i - 1].3 ), arrayEnumerate(_usage_snapshots) ) AS _reset_indices, if( length(_usage_snapshots) > 0, arrayConcat( arrayMap(i -> i - 1, _reset_indices), [length(_usage_snapshots)] ), [] ) AS _segment_end_indices, arraySum( arrayMap(i -> _usage_snapshots[i].1, _segment_end_indices) ) AS _input_tokens, arraySum( arrayMap(i -> _usage_snapshots[i].2, _segment_end_indices) ) AS _cache_read_input_tokens, arraySum( arrayMap(i -> _usage_snapshots[i].3, _segment_end_indices) ) AS _output_tokens, if(length(_timestamps) > 0, arrayMin(_timestamps), cs.session_date) AS _session_date, if( length(_timestamps) > 0, arrayMax(_timestamps), cs.last_interaction_date ) AS _last_interaction_date, greatest( dateDiff('minute', _session_date, _last_interaction_date), 0 ) AS _duration_min, arrayFilter( x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines ) AS _meta_lines, if( length(_meta_lines) > 0, JSONExtractString( JSONExtractRaw(arrayElement(_meta_lines, -1), 'payload'), 'model_provider' ), '' ) AS _model_provider, arrayFilter( x -> JSONExtractString(x, 'type') = 'turn_context' AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'model') != '' AND JSONExtractString( JSONExtractRaw(x, 'payload'), 'model' ) != '<synthetic>', _all_lines ) AS _turn_context_lines, if( length(_turn_context_lines) > 0, JSONExtractString( JSONExtractRaw(arrayElement(_turn_context_lines, -1), 'payload'), 'model' ), '' ) AS _model_from_turn_context, arrayDistinct( arrayFilter( x -> x != '', extractAll( cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL' ) ) ) AS _skills, toUInt32( length( extractAll(_error_sample_content, '\\"exit_code\\":[1-9][0-9]*') ) + if( _is_capped, length( extractAll( _error_sample_content, '([A-Z][a-zA-Z]+Error):' ) ) + length( extractAll( _error_sample_content, '([A-Z][a-zA-Z]+Exception):' ) ), arrayCount( x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%', _tool_output_lines ) ) ) AS _error_count SELECT * EXCEPT (session_date, last_interaction_date, content), _session_date AS session_date, _last_interaction_date AS last_interaction_date, 'codex' AS source, _input_tokens AS input_tokens, _output_tokens AS output_tokens, _cache_read_input_tokens AS cache_read_input_tokens, toUInt64(0) AS cache_creation_input_tokens, toUInt64(0) AS cache_creation_5m_input_tokens, toUInt64(0) AS cache_creation_1h_input_tokens, _input_tokens + _output_tokens AS total_tokens, toUInt8(_is_capped) AS is_capped, toUInt8(0) AS stale_extraction, _skills AS skills, [] :: Array(String) AS slash_commands, [] :: Array(String) AS subagent_types, toUInt32(length(_interaction_lines)) AS total_interactions, toUInt32(_duration_min) AS actual_duration_min, if( length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0 ) AS avg_period_sec, if( length(_prompt_periods_sec) > 0, toFloat64( arrayElement( arraySort(_prompt_periods_sec), toUInt64(ceil(length(_prompt_periods_sec) / 2)) ) ), 0 ) AS median_period_sec, toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) AS quick_responses, toUInt32( arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec) ) AS normal_responses, toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) AS long_pauses, _error_count AS error_count, if( _error_count = 0, '', multiIf( _error_sample_content ILIKE '%OperationFailed%', 'OperationFailed', _error_sample_content ILIKE '%UnknownError%', 'UnknownError', _error_sample_content ILIKE '%ORPCError%', 'ORPCError', _error_sample_content ILIKE '%TimeoutError%', 'TimeoutError', _error_sample_content ILIKE '%TypeError%', 'TypeError', _error_sample_content ILIKE '%ReferenceError%', 'ReferenceError', _error_sample_content ILIKE '%Error:%', if( length(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Error):')) > 0, arrayElement(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Error):'), 1), 'GenericError' ), _error_sample_content ILIKE '%Exception:%', if( length(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Exception):')) > 0, arrayElement(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Exception):'), 1), 'Exception' ), _error_sample_content ILIKE '%error:%', 'GenericError', _error_sample_content ILIKE '%failed%', 'OperationFailed', _error_sample_content ILIKE '%timeout%', 'Timeout', _error_sample_content ILIKE '%not found%', 'NotFound', 'UnknownError' ) ) AS error_pattern, multiIf( _model_from_turn_context != '', _model_from_turn_context, _model_provider != '' AND _model_provider != '<synthetic>', _model_provider, 'unknown' ) AS model_used, toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) AS has_commit, toUInt8(0) AS used_plan_mode, toUInt32(arraySum(_inference_gaps)) AS inference_duration_sec, toUInt32(0) AS human_duration_sec, CASE WHEN _duration_min <= 10 AND (_input_tokens + _output_tokens) < 500000 AND _output_tokens > 1000 THEN 'quick_win' WHEN _duration_min > 30 AND _output_tokens > 50000 AND cs.git_sha IS NOT NULL AND cs.git_sha != '' THEN 'deep_work' WHEN (_input_tokens + _output_tokens) > 1000000 AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3 AND _duration_min > 20 THEN 'struggle' WHEN length(_skills) >= 3 AND (cs.git_sha IS NULL OR cs.git_sha = '') AND (_input_tokens + _output_tokens) > 200000 THEN 'exploration' WHEN _duration_min < 3 AND _output_tokens < 500 THEN 'abandoned' ELSE 'standard' END AS session_archetype, toUInt8( greatest( toFloat64(0), least( toFloat64(100), round( toFloat64(50) + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0) + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0) + (least(toUInt32(length(_skills)), 3) * 5) - if( (_input_tokens + _output_tokens) > 1500000 AND (cs.git_sha IS NULL OR cs.git_sha = ''), 20, 0 ) - if(_duration_min < 2 AND _output_tokens < 200, 30, 0) - (least(_error_count, toUInt32(10)) * 2) ) ) ) ) AS success_score, ROW_NUMBER() OVER ( PARTITION BY cs.organization_id, cs.user_id, cs.session_id ORDER BY cs.ingested_at DESC ) AS _dedupe_rank FROM rudel.codex_sessions AS cs ) WHERE _dedupe_rank = 1;

-- operation: create_materialized_view key=materialized_view:rudel.session_analytics_mv risk=caution
CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.session_analytics_mv TO rudel.session_analytics AS
SELECT * EXCEPT (_dedupe_rank) FROM ( WITH arrayConcat( [tuple('main', cs.content)], arrayMap( (name, content) -> tuple(concat('subagent:', name), content), mapKeys(cs.subagents), mapValues(cs.subagents) ) ) AS _transcripts, arrayExists( transcript -> length(transcript.2) > 167772160 OR countSubstrings(transcript.2, '\n') > 100000, _transcripts ) AS _is_capped, arraySlice( splitByChar( '\n', substring(cs.content, 1, 167772160) ), 1, 100000 ) AS _main_lines, arrayFlatten( arrayMap( transcript -> arraySlice( splitByChar( '\n', substring(transcript.2, 1, 167772160) ), 1, 100000 ), _transcripts ) ) AS _token_safe_lines, substring(cs.content, 1, 20000000) AS _error_sample_content, arrayFilter( x -> JSONExtractString(x, 'type') IN ('user', 'assistant'), _main_lines ) AS _interaction_lines, arrayFilter( x -> isNotNull(x.2), arrayMap( x -> tuple( x, parseDateTime64BestEffortOrNull(JSONExtractString(x, 'timestamp')) ), _interaction_lines ) ) AS _timestamped_interactions, arrayMap(x -> assumeNotNull(x.2), _timestamped_interactions) AS _timestamps, arrayMap( x -> JSONExtractString(x.1, 'type'), _timestamped_interactions ) AS _msg_types, if( length(_timestamps) > 1, arrayMap( i -> greatest( dateDiff('second', _timestamps[i], _timestamps[i + 1]), 0 ), range(1, length(_timestamps)) ), [] ) AS _prompt_periods_sec, if( length(_timestamps) > 1, arrayMap( i -> if( _msg_types[i] = 'user' AND _msg_types[i + 1] = 'assistant', greatest( dateDiff('second', _timestamps[i], _timestamps[i + 1]), 0 ), 0 ), range(1, length(_timestamps)) ), [] ) AS _inference_gaps, if( length(_timestamps) > 1, arrayMap( i -> if( _msg_types[i] = 'assistant' AND _msg_types[i + 1] = 'user', greatest( dateDiff('second', _timestamps[i], _timestamps[i + 1]), 0 ), 0 ), range(1, length(_timestamps)) ), [] ) AS _human_gaps, arrayFilter( x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message') AND JSONHas(JSONExtractRaw(x, 'message'), 'usage'), _token_safe_lines ) AS _assistant_usage_lines, arrayMap( (line, sequence) -> tuple( multiIf( JSONExtractString(line, 'requestId') != '', concat('request:', JSONExtractString(line, 'requestId')), JSONExtractString(JSONExtractRaw(line, 'message'), 'id') != '', concat( 'message:', JSONExtractString(JSONExtractRaw(line, 'message'), 'id') ), JSONExtractString(line, 'uuid') != '', concat('uuid:', JSONExtractString(line, 'uuid')), concat('line:', toString(sequence)) ), parseDateTime64BestEffortOrNull(JSONExtractString(line, 'timestamp')), sequence, line ), _assistant_usage_lines, arrayEnumerate(_assistant_usage_lines) ) AS _usage_records, arrayDistinct(arrayMap(record -> record.1, _usage_records)) AS _usage_keys, arrayMap( key -> arrayElement( arraySort( record -> tuple( isNotNull(record.2), ifNull(record.2, toDateTime64(0, 3, 'UTC')), record.3 ), arrayFilter(record -> record.1 = key, _usage_records) ), -1 ), _usage_keys ) AS _deduped_usage_records, arrayMap(record -> record.4, _deduped_usage_records) AS _deduped_assistant_lines, arrayMap( line -> JSONExtractRaw(JSONExtractRaw(line, 'message'), 'usage'), _deduped_assistant_lines ) AS _usage_objects, arrayMap( usage -> toUInt64OrZero(JSONExtractRaw(usage, 'input_tokens')), _usage_objects ) AS _uncached_input_by_request, arrayMap( usage -> toUInt64OrZero( JSONExtractRaw(usage, 'cache_read_input_tokens') ), _usage_objects ) AS _cache_read_by_request, arrayMap( usage -> toUInt64OrZero( JSONExtractRaw(usage, 'cache_creation_input_tokens') ), _usage_objects ) AS _flat_cache_creation_by_request, arrayMap( usage -> toUInt64OrZero( JSONExtractRaw( JSONExtractRaw(usage, 'cache_creation'), 'ephemeral_5m_input_tokens' ) ), _usage_objects ) AS _nested_cache_creation_5m_by_request, arrayMap( usage -> toUInt64OrZero( JSONExtractRaw( JSONExtractRaw(usage, 'cache_creation'), 'ephemeral_1h_input_tokens' ) ), _usage_objects ) AS _nested_cache_creation_1h_by_request, arrayMap( usage -> toUInt64OrZero(JSONExtractRaw(usage, 'output_tokens')), _usage_objects ) AS _output_by_request, arraySum(_uncached_input_by_request) AS _uncached_input_tokens, arraySum(_cache_read_by_request) AS _cache_read, arraySum(_nested_cache_creation_1h_by_request) AS _cache_creation_1h, arraySum( arrayMap( (flat, five_minute, one_hour) -> greatest(flat, five_minute + one_hour) - one_hour, _flat_cache_creation_by_request, _nested_cache_creation_5m_by_request, _nested_cache_creation_1h_by_request ) ) AS _cache_creation_5m, _cache_creation_5m + _cache_creation_1h AS _cache_creation, _uncached_input_tokens + _cache_read + _cache_creation AS _input_tokens, arraySum(_output_by_request) AS _output_tokens, arrayDistinct( arrayFilter( x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"') ) ) AS _skills, arrayDistinct( arrayFilter( x -> x != '', extractAll( cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"' ) ) ) AS _subagent_types, arrayDistinct( arrayFilter( x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>') ) ) AS _slash_commands, toUInt32( length(extractAll(_error_sample_content, '"isApiErrorMessage":true')) + length(extractAll(_error_sample_content, '"is_error":true')) ) AS _error_count, arrayFilter( line -> JSONExtractString(line, 'type') = 'assistant' AND JSONHas(line, 'message') AND JSONExtractString(JSONExtractRaw(line, 'message'), 'model') != '' AND JSONExtractString( JSONExtractRaw(line, 'message'), 'model' ) != '<synthetic>', _main_lines ) AS _model_lines, if( length(_model_lines) > 0, JSONExtractString( JSONExtractRaw(arrayElement(_model_lines, -1), 'message'), 'model' ), '' ) AS _model_used, if(length(_timestamps) > 0, arrayMin(_timestamps), cs.session_date) AS _session_date, if( length(_timestamps) > 0, arrayMax(_timestamps), cs.last_interaction_date ) AS _last_interaction_date, greatest( dateDiff('minute', _session_date, _last_interaction_date), 0 ) AS _duration_min SELECT * EXCEPT (session_date, last_interaction_date, content, subagents), _session_date AS session_date, _last_interaction_date AS last_interaction_date, 'claude_code' AS source, _input_tokens AS input_tokens, _output_tokens AS output_tokens, _cache_read AS cache_read_input_tokens, _cache_creation AS cache_creation_input_tokens, _cache_creation_5m AS cache_creation_5m_input_tokens, _cache_creation_1h AS cache_creation_1h_input_tokens, _input_tokens + _output_tokens AS total_tokens, toUInt8(_is_capped) AS is_capped, toUInt8(0) AS stale_extraction, _skills AS skills, _slash_commands AS slash_commands, _subagent_types AS subagent_types, toUInt32(length(_timestamps)) AS total_interactions, toUInt32(_duration_min) AS actual_duration_min, if( length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0 ) AS avg_period_sec, if( length(_prompt_periods_sec) > 0, toFloat64( arrayElement( arraySort(_prompt_periods_sec), toUInt64(ceil(length(_prompt_periods_sec) / 2)) ) ), 0 ) AS median_period_sec, toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) AS quick_responses, toUInt32( arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec) ) AS normal_responses, toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) AS long_pauses, _error_count AS error_count, if( _error_count = 0, '', multiIf( _error_sample_content ILIKE '%OperationFailed%', 'OperationFailed', _error_sample_content ILIKE '%UnknownError%', 'UnknownError', _error_sample_content ILIKE '%ORPCError%', 'ORPCError', _error_sample_content ILIKE '%TimeoutError%', 'TimeoutError', _error_sample_content ILIKE '%TypeError%', 'TypeError', _error_sample_content ILIKE '%ReferenceError%', 'ReferenceError', _error_sample_content ILIKE '%Error:%', if( length(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Error):')) > 0, arrayElement(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Error):'), 1), 'GenericError' ), _error_sample_content ILIKE '%Exception:%', if( length(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Exception):')) > 0, arrayElement(extractAll(_error_sample_content, '([A-Z][a-zA-Z]+Exception):'), 1), 'Exception' ), _error_sample_content ILIKE '%error:%', 'GenericError', _error_sample_content ILIKE '%failed%', 'OperationFailed', _error_sample_content ILIKE '%timeout%', 'Timeout', _error_sample_content ILIKE '%not found%', 'NotFound', 'UnknownError' ) ) AS error_pattern, _model_used AS model_used, toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) AS has_commit, toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) AS used_plan_mode, toUInt32(arraySum(_inference_gaps)) AS inference_duration_sec, toUInt32(arraySum(_human_gaps)) AS human_duration_sec, CASE WHEN _duration_min <= 10 AND (_input_tokens + _output_tokens) < 500000 AND _output_tokens > 1000 THEN 'quick_win' WHEN _duration_min > 30 AND _output_tokens > 50000 AND cs.git_sha IS NOT NULL AND cs.git_sha != '' THEN 'deep_work' WHEN (_input_tokens + _output_tokens) > 1000000 AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3 AND _duration_min > 20 THEN 'struggle' WHEN length(_skills) >= 3 AND (cs.git_sha IS NULL OR cs.git_sha = '') AND (_input_tokens + _output_tokens) > 200000 THEN 'exploration' WHEN _duration_min < 3 AND _output_tokens < 500 THEN 'abandoned' ELSE 'standard' END AS session_archetype, toUInt8( greatest( toFloat64(0), least( toFloat64(100), round( toFloat64(50) + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0) + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0) + (least(toUInt32(length(_skills)), 3) * 5) - if( (_input_tokens + _output_tokens) > 1500000 AND (cs.git_sha IS NULL OR cs.git_sha = ''), 20, 0 ) - if(_duration_min < 2 AND _output_tokens < 200, 30, 0) - (least(_error_count, toUInt32(10)) * 2) ) ) ) ) AS success_score, ROW_NUMBER() OVER ( PARTITION BY cs.organization_id, cs.user_id, cs.session_id ORDER BY cs.ingested_at DESC ) AS _dedupe_rank FROM rudel.claude_sessions AS cs )
WHERE _dedupe_rank = 1;

-- manual-operation: allow SharedMergeTree materialized-view metadata to propagate
SELECT sleepEachRow(1) FROM numbers(8) SETTINGS max_block_size=1;

-- manual-operation: replay the latest Claude raw version through the rebuilt MV
-- Re-running is safe: ReplacingMergeTree keeps the newest identity version.
INSERT INTO rudel.claude_sessions
(
  `session_date`,
  `last_interaction_date`,
  `session_id`,
  `organization_id`,
  `project_path`,
  `git_remote`,
  `package_name`,
  `package_type`,
  `content`,
  `filter_version`,
  `ingested_at`,
  `user_id`,
  `git_branch`,
  `git_sha`,
  `tag`,
  `subagents`
)
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=1
SELECT
  cs.session_date,
  cs.last_interaction_date,
  cs.session_id,
  cs.organization_id,
  cs.project_path,
  cs.git_remote,
  cs.package_name,
  cs.package_type,
  cs.content,
  cs.filter_version,
  greatest(now64(3), cs.ingested_at + toIntervalMillisecond(1)),
  cs.user_id,
  cs.git_branch,
  cs.git_sha,
  cs.tag,
  cs.subagents
FROM rudel.claude_sessions AS cs
INNER ANY JOIN
(
  SELECT
    organization_id,
    user_id,
    session_id,
    max(ingested_at) AS ingested_at
  FROM rudel.claude_sessions
  GROUP BY organization_id, user_id, session_id
) AS latest
USING (organization_id, user_id, session_id, ingested_at);

-- manual-operation: replay the latest Codex raw version through the rebuilt MV
INSERT INTO rudel.codex_sessions
(
  `session_date`,
  `last_interaction_date`,
  `session_id`,
  `organization_id`,
  `project_path`,
  `git_remote`,
  `package_name`,
  `package_type`,
  `content`,
  `filter_version`,
  `ingested_at`,
  `user_id`,
  `git_branch`,
  `git_sha`,
  `tag`
)
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=1
SELECT
  cs.session_date,
  cs.last_interaction_date,
  cs.session_id,
  cs.organization_id,
  cs.project_path,
  cs.git_remote,
  cs.package_name,
  cs.package_type,
  cs.content,
  cs.filter_version,
  greatest(now64(3), cs.ingested_at + toIntervalMillisecond(1)),
  cs.user_id,
  cs.git_branch,
  cs.git_sha,
  cs.tag
FROM rudel.codex_sessions AS cs
INNER ANY JOIN
(
  SELECT
    organization_id,
    user_id,
    session_id,
    max(ingested_at) AS ingested_at
  FROM rudel.codex_sessions
  GROUP BY organization_id, user_id, session_id
) AS latest
USING (organization_id, user_id, session_id, ingested_at);

-- manual-operation: abort if any latest raw identity failed to rebuild
SELECT throwIf(
  count() > 0,
  'token counting rebuild aborted: latest raw identity missing from analytics'
)
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
    GROUP BY source, organization_id, user_id, session_id

    UNION ALL

    SELECT
      'codex' AS source,
      organization_id,
      user_id,
      session_id
    FROM rudel.codex_sessions
    GROUP BY source, organization_id, user_id, session_id
  ) AS raw
  LEFT ANTI JOIN
  (
    SELECT source, organization_id, user_id, session_id
    FROM rudel.session_analytics FINAL
    GROUP BY source, organization_id, user_id, session_id
  ) AS analytics
  USING (source, organization_id, user_id, session_id)
);

-- manual-operation: abort on token-class or rebuild-marker invariant failures
SELECT throwIf(
  count() > 0,
  'token counting rebuild aborted: token-class invariant failed'
)
FROM rudel.session_analytics FINAL
WHERE
  total_tokens != input_tokens + output_tokens
  OR cache_creation_input_tokens
    != cache_creation_5m_input_tokens + cache_creation_1h_input_tokens
  OR (source = 'claude_code'
    AND input_tokens < cache_read_input_tokens + cache_creation_input_tokens)
  OR (source = 'codex'
    AND (cache_read_input_tokens > input_tokens
      OR cache_creation_input_tokens != 0
      OR cache_creation_5m_input_tokens != 0
      OR cache_creation_1h_input_tokens != 0));

SELECT throwIf(
  count() > 0,
  'token counting rebuild aborted: raw-backed analytics remained stale'
)
FROM
(
  SELECT
    analytics.source,
    analytics.organization_id,
    analytics.user_id,
    analytics.session_id,
    analytics.stale_extraction
  FROM
  (
    SELECT *
    FROM rudel.session_analytics FINAL
  ) AS analytics
  INNER JOIN
  (
    SELECT
      'claude_code' AS source,
      organization_id,
      user_id,
      session_id
    FROM rudel.claude_sessions
    GROUP BY source, organization_id, user_id, session_id

    UNION ALL

    SELECT
      'codex' AS source,
      organization_id,
      user_id,
      session_id
    FROM rudel.codex_sessions
    GROUP BY source, organization_id, user_id, session_id
  ) AS raw
  USING (source, organization_id, user_id, session_id)
  WHERE analytics.stale_extraction != 0
);
