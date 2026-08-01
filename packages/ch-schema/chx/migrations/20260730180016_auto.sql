-- chkit-migration-format: v1
-- generated-at: 2026-07-30T18:00:16.690Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 7
-- operation-count: 13
-- risk-summary: safe=0, caution=1, danger=12
-- manual-rebuild: RUD-187 RUD-188 RUD-186 RUD-222
-- PRECONDITION: session ingest is quiesced for the duration of this migration.
-- operation: rebuild_table key=table:rudel.session_analytics risk=caution

-- Abort before changing anything if rebuilding from the TTL-governed raw tables
-- would discard an analytics-only session.
SELECT throwIf(
  count() > 0,
  'session_analytics rebuild aborted: analytics-only session identities exist'
)
FROM
(
  SELECT source, organization_id, user_id, session_id
  FROM rudel.session_analytics FINAL
  GROUP BY source, organization_id, user_id, session_id
) AS analytics
LEFT ANTI JOIN
(
  SELECT 'claude_code' AS source, organization_id, user_id, session_id
  FROM rudel.claude_sessions
  GROUP BY organization_id, user_id, session_id

  UNION ALL

  SELECT 'codex' AS source, organization_id, user_id, session_id
  FROM rudel.codex_sessions
  GROUP BY organization_id, user_id, session_id
) AS raw
USING (source, organization_id, user_id, session_id);

SELECT throwIf(
  count() > 0,
  'session_analytics rebuild aborted: backup table already exists; inspect cutover state and resume at the RECOVERY marker if the rename completed'
)
FROM system.tables
WHERE database = 'rudel'
  AND name = 'session_analytics_pre_identity_20260730';

CREATE TABLE IF NOT EXISTS rudel.session_analytics_v2
(
  `session_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `last_interaction_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `session_id` String,
  `organization_id` String,
  `project_path` String,
  `git_remote` String DEFAULT '''''',
  `package_name` String DEFAULT '''''',
  `package_type` String DEFAULT '''''',
  `filter_version` UInt8 DEFAULT 0,
  `ingested_at` DateTime64(3, 'UTC') DEFAULT now64(3),
  `user_id` String,
  `git_branch` Nullable(String),
  `git_sha` Nullable(String),
  `tag` Nullable(String),
  `source` LowCardinality(String) DEFAULT '''claude_code''',
  `skills` Array(String) DEFAULT [],
  `slash_commands` Array(String) DEFAULT [],
  `subagent_types` Array(String) DEFAULT [],
  `input_tokens` UInt64 DEFAULT 0,
  `output_tokens` UInt64 DEFAULT 0,
  `cache_read_input_tokens` UInt64 DEFAULT 0,
  `cache_creation_input_tokens` UInt64 DEFAULT 0,
  `total_tokens` UInt64 DEFAULT 0,
  `total_interactions` UInt32 DEFAULT 0,
  `actual_duration_min` UInt32 DEFAULT 0,
  `avg_period_sec` Float64 DEFAULT 0,
  `median_period_sec` Float64 DEFAULT 0,
  `quick_responses` UInt32 DEFAULT 0,
  `normal_responses` UInt32 DEFAULT 0,
  `long_pauses` UInt32 DEFAULT 0,
  `error_count` UInt32 DEFAULT 0,
  `error_pattern` LowCardinality(String) DEFAULT '',
  `model_used` String DEFAULT '''''',
  `has_commit` UInt8 DEFAULT 0,
  `session_archetype` String DEFAULT '''standard''',
  `success_score` UInt8 DEFAULT 0,
  `used_plan_mode` UInt8 DEFAULT 0,
  `inference_duration_sec` UInt32 DEFAULT 0,
  `human_duration_sec` UInt32 DEFAULT 0
) ENGINE = ReplacingMergeTree(ingested_at)
PRIMARY KEY (`source`, `organization_id`, `user_id`, `session_id`)
ORDER BY (`source`, `organization_id`, `user_id`, `session_id`)
SETTINGS index_granularity = 8192, storage_policy = 's3';

-- Rebuild from the canonical raw sources. The INSERT column list is explicit
-- because ClickHouse matches INSERT ... SELECT columns by position.
-- Rebuild in stable session-month chunks. session_analytics_v2 is deliberately
-- unpartitioned so ReplacingMergeTree can collapse identity versions across time.
-- If a chunk is only partially written, the parity verifier catches it. Delete that
-- bounded source + session_date scope from session_analytics_v2, wait for the delete,
-- then re-dispatch; DROP PARTITION would discard the entire unpartitioned shadow.
-- claude_code session-month chunk: before 2025-07.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date < toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date < toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: before 2025-07.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date < toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date < toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2025-07.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2025-07.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2025-07-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2025-08.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2025-08.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2025-08-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2025-09.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2025-09.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2025-09-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2025-10.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2025-10.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2025-10-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2025-11.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2025-11.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2025-11-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2025-12.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2025-12.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2025-12-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-01.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-01.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-01-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-02.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-02.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-02-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-03.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-03.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-03-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-04.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-04.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-04-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-05.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-05.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-05-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-06.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-06.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-06-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-07.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-07.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-07-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: 2026-08.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: 2026-08.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
    AND cs.session_date < toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-08-01 00:00:00', 3, 'UTC')
      AND session_date < toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- claude_code session-month chunk: from 2026-09.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'claude_code'
        AND session_date >= toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- codex session-month chunk: from 2026-09.
INSERT INTO rudel.session_analytics_v2
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
  `total_tokens`,
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
SETTINGS
  async_insert=0,
  max_threads=1,
  max_insert_threads=1,
  max_block_size=64,
  max_bytes_before_external_group_by=268435456
SELECT
  session_date,
  last_interaction_date,
  session_id,
  organization_id,
  project_path,
  git_remote,
  package_name,
  package_type,
  filter_version,
  ingested_at,
  user_id,
  git_branch,
  git_sha,
  tag,
  source,
  skills,
  slash_commands,
  subagent_types,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  total_tokens,
  total_interactions,
  actual_duration_min,
  avg_period_sec,
  median_period_sec,
  quick_responses,
  normal_responses,
  long_pauses,
  error_count,
  error_pattern,
  model_used,
  has_commit,
  session_archetype,
  success_score,
  used_plan_mode,
  inference_duration_sec,
  human_duration_sec
FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score

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
  USING (organization_id, user_id, session_id, ingested_at)
  WHERE (_is_capped OR length(_timestamps) > 0)
    AND cs.session_date >= toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    AND (
      SELECT count()
      FROM rudel.session_analytics_v2
      WHERE source = 'codex'
        AND session_date >= toDateTime64('2026-09-01 00:00:00', 3, 'UTC')
    ) = 0
);

-- Canonical-source invariants. Count physical rows here: FINAL would collapse
-- duplicate ReplacingMergeTree versions before the guard could detect them.
SELECT throwIf(
  count() != uniqExact(tuple(source, organization_id, user_id, session_id)),
  'session_analytics rebuild aborted: duplicate full identities in shadow table'
)
FROM rudel.session_analytics_v2;

SELECT
  source,
  count() AS row_count,
  uniqExact(tuple(source, organization_id, user_id, session_id)) AS unique_identity_count,
  sum(input_tokens) AS input_tokens,
  sum(output_tokens) AS output_tokens,
  sum(total_tokens) AS total_tokens,
  min(session_date) AS earliest_session,
  max(last_interaction_date) AS latest_interaction
FROM rudel.session_analytics_v2 FINAL
GROUP BY source
ORDER BY source;

-- Classify differences from the old target without treating it as the parity
-- oracle. New-only identities are raw sessions the old build failed to retain.
SELECT
  difference,
  count() AS identity_count
FROM
(
  SELECT
    'old_only_identity' AS difference,
    old.source,
    old.organization_id,
    old.user_id,
    old.session_id
  FROM
  (
    SELECT source, organization_id, user_id, session_id
    FROM rudel.session_analytics FINAL
    GROUP BY source, organization_id, user_id, session_id
  ) AS old
  LEFT ANTI JOIN
  (
    SELECT source, organization_id, user_id, session_id
    FROM rudel.session_analytics_v2 FINAL
    GROUP BY source, organization_id, user_id, session_id
  ) AS new
  USING (source, organization_id, user_id, session_id)

  UNION ALL

  SELECT
    'new_only_identity' AS difference,
    new.source,
    new.organization_id,
    new.user_id,
    new.session_id
  FROM
  (
    SELECT source, organization_id, user_id, session_id
    FROM rudel.session_analytics_v2 FINAL
    GROUP BY source, organization_id, user_id, session_id
  ) AS new
  LEFT ANTI JOIN
  (
    SELECT source, organization_id, user_id, session_id
    FROM rudel.session_analytics FINAL
    GROUP BY source, organization_id, user_id, session_id
  ) AS old
  USING (source, organization_id, user_id, session_id)
)
GROUP BY difference
ORDER BY difference;

-- With ingest quiesced, detach both old writers, atomically rename the tables,
-- then recreate both MVs against the new physical target.
DROP TABLE IF EXISTS rudel.codex_session_analytics_mv SYNC;
DROP TABLE IF EXISTS rudel.session_analytics_mv SYNC;

RENAME TABLE
  rudel.session_analytics TO rudel.session_analytics_pre_identity_20260730,
  rudel.session_analytics_v2 TO rudel.session_analytics;

-- RECOVERY: If execution stopped after the RENAME, resume here. Every remaining
-- statement is idempotent so this tail can be executed again safely.
-- The rollback table keeps queryable rows for seven days, then its TTL removes
-- the transcript-bearing data. The empty table can be dropped after the window.
ALTER TABLE rudel.session_analytics_pre_identity_20260730
  ADD COLUMN IF NOT EXISTS `_backup_expires_at` DateTime64(3, 'UTC')
  DEFAULT now64(3) + toIntervalDay(7);
ALTER TABLE rudel.session_analytics_pre_identity_20260730
  MATERIALIZE COLUMN `_backup_expires_at`;
ALTER TABLE rudel.session_analytics_pre_identity_20260730
  MODIFY TTL `_backup_expires_at` DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.codex_session_analytics_mv
TO rudel.session_analytics AS

  SELECT * EXCEPT (_dedupe_rank)
  FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> x != '',
      splitByChar('\n', _line_safe_content)
    ) AS _all_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _all_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(i < length(_timestamps),
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item' OR JSONExtractString(x, 'type') = 'event_msg',
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
      _all_lines
    ) AS _token_count_lines,

    if(length(_token_count_lines) > 0,
      JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
      '{}'
    ) AS _final_usage,

    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS _input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS _output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS _cache_read_input_tokens,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min,

    arrayFilter(x -> JSONExtractString(x, 'type') = 'session_meta', _all_lines) AS _meta_lines,

    JSONExtractString(
      JSONExtractRaw(arrayElement(_meta_lines, 1), 'payload'),
      'model_provider'
    ) AS _model_provider,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'turn_context',
      _all_lines
    ) AS _turn_context_lines,

    if(length(_turn_context_lines) > 0,
      JSONExtractString(JSONExtractRaw(arrayElement(_turn_context_lines, 1), 'payload'), 'model'),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'))) AS _skills,

    toUInt32(
      length(extractAll(cs.content, '\\\\"exit_code\\\\":[1-9][0-9]*'))
      + arrayCount(
          x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
          _tool_output_lines
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'codex' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read_input_tokens as cache_read_input_tokens,
    toUInt64(0) as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
    toUInt32(length(_interaction_lines)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '', _model_provider,
      'unknown'
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(0) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score,
    ROW_NUMBER() OVER (
      PARTITION BY cs.organization_id, cs.user_id, cs.session_id
      ORDER BY cs.ingested_at DESC
    ) AS _dedupe_rank

  FROM rudel.codex_sessions AS cs
  WHERE _is_capped OR length(_timestamps) > 0
  )
  WHERE _dedupe_rank = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.session_analytics_mv
TO rudel.session_analytics AS

  SELECT * EXCEPT (_dedupe_rank)
  FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\n', _line_safe_content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(x, 'type'),
      _ts_lines
    ) AS _msg_types,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'assistant' AND JSONHas(x, 'message'),
      splitByChar('\n', _line_safe_content)
    ) AS _assistant_lines,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'id'),
      _assistant_lines
    ) AS _assistant_ids,

    arrayFilter(
      (x, i) -> i = length(_assistant_ids) OR
        _assistant_ids[i] != _assistant_ids[i + 1],
      _assistant_lines,
      arrayEnumerate(_assistant_lines)
    ) AS _deduped_assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens'))
      + toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _deduped_assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _deduped_assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _deduped_assistant_lines)) AS _cache_creation,

    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"'))) AS _skills,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '"name":"Task"[^}]*"subagent_type":"([^"]+)"'))) AS _subagent_types,
    arrayDistinct(arrayFilter(x -> x != '', extractAll(cs.content, '<command-name>/([^<]+)</command-name>'))) AS _slash_commands,

    toUInt32(
      length(extractAll(cs.content, '"isApiErrorMessage":true'))
      + length(extractAll(cs.content, '"is_error":true'))
    ) AS _error_count,

    if(_is_capped, cs.session_date, arrayMin(_timestamps)) AS _session_date,
    if(_is_capped, cs.last_interaction_date, arrayMax(_timestamps)) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'claude_code' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    _skills as skills,
    _slash_commands as slash_commands,
    _subagent_types as subagent_types,
    toUInt32(length(_timestamps)) as total_interactions,
    toUInt32(_duration_min) as actual_duration_min,
    if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(arrayElement(
        arraySort(_prompt_periods_sec),
        toUInt64(ceil(length(_prompt_periods_sec) / 2))
      )),
      0
    ) as median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
    toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
    _error_count as error_count,
    if(
      _error_count = 0,
      '',
      multiIf(
        cs.content ILIKE '%OperationFailed%', 'OperationFailed',
        cs.content ILIKE '%UnknownError%', 'UnknownError',
        cs.content ILIKE '%ORPCError%', 'ORPCError',
        cs.content ILIKE '%TimeoutError%', 'TimeoutError',
        cs.content ILIKE '%TypeError%', 'TypeError',
        cs.content ILIKE '%ReferenceError%', 'ReferenceError',
        cs.content ILIKE '%Error:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Error):'), 1),
            'GenericError'
          ),
        cs.content ILIKE '%Exception:%',
          if(
            length(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):')) > 0,
            arrayElement(extractAll(cs.content, '([A-Z][a-zA-Z]+Exception):'), 1),
            'Exception'
          ),
        cs.content ILIKE '%error:%', 'GenericError',
        cs.content ILIKE '%failed%', 'OperationFailed',
        cs.content ILIKE '%timeout%', 'Timeout',
        cs.content ILIKE '%not found%', 'NotFound',
        'UnknownError'
      )
    ) as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\n', _line_safe_content)
            ),
            -1
          ),
          'message'
        ),
        'model'
      )
    ) as model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND cs.git_sha IS NOT NULL AND cs.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN length(_skills) >= 3
          AND (cs.git_sha IS NULL OR cs.git_sha = '')
          AND (_input_tokens + _output_tokens) > 200000
      THEN 'exploration'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,

toUInt8(
  greatest(
    toFloat64(0),
    least(
      toFloat64(100),
      round(
        toFloat64(50)
        + if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0)
        + if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0)
        + (least(toUInt32(length(_skills)), 3) * 5)
        - if(
            (_input_tokens + _output_tokens) > 1500000
              AND (cs.git_sha IS NULL OR cs.git_sha = ''),
            20,
            0
          )
        - if(_duration_min < 2 AND _output_tokens < 200, 30, 0)
        - (least(_error_count, toUInt32(10)) * 2)
      )
    )
  )
) as success_score,
    ROW_NUMBER() OVER (
      PARTITION BY cs.organization_id, cs.user_id, cs.session_id
      ORDER BY cs.ingested_at DESC
    ) AS _dedupe_rank

  FROM rudel.claude_sessions AS cs
  WHERE _is_capped OR length(_timestamps) > 0
  )
  WHERE _dedupe_rank = 1;

SELECT throwIf(
  count() > 0,
  'session_analytics rebuild aborted: transcript columns survived cutover'
)
FROM system.columns
WHERE database = 'rudel'
  AND table = 'session_analytics'
  AND name IN ('content', 'subagents');

-- These dated and broken tables were one-off migration safety copies. They have
-- no owner or retention policy and must not outlive the canonical raw-table TTL.
-- operation: drop_table key=table:rudel.claude_sessions_backup risk=danger
DROP TABLE IF EXISTS rudel.claude_sessions_backup SYNC;
-- operation: drop_table key=table:rudel.claude_sessions_backup_20260403 risk=danger
DROP TABLE IF EXISTS rudel.claude_sessions_backup_20260403 SYNC;
-- operation: drop_table key=table:rudel.claude_sessions_backup_20260518 risk=danger
DROP TABLE IF EXISTS rudel.claude_sessions_backup_20260518 SYNC;
-- operation: drop_table key=table:rudel.claude_sessions_broken risk=danger
DROP TABLE IF EXISTS rudel.claude_sessions_broken SYNC;
-- operation: drop_table key=table:rudel.codex_sessions_backup risk=danger
DROP TABLE IF EXISTS rudel.codex_sessions_backup SYNC;
-- operation: drop_table key=table:rudel.codex_sessions_backup_20260403 risk=danger
DROP TABLE IF EXISTS rudel.codex_sessions_backup_20260403 SYNC;
-- operation: drop_table key=table:rudel.codex_sessions_backup_20260518 risk=danger
DROP TABLE IF EXISTS rudel.codex_sessions_backup_20260518 SYNC;
-- operation: drop_table key=table:rudel.codex_sessions_broken risk=danger
DROP TABLE IF EXISTS rudel.codex_sessions_broken SYNC;
-- operation: drop_table key=table:rudel.session_analytics_backup risk=danger
DROP TABLE IF EXISTS rudel.session_analytics_backup SYNC;
-- operation: drop_table key=table:rudel.session_analytics_backup_20260401 risk=danger
DROP TABLE IF EXISTS rudel.session_analytics_backup_20260401 SYNC;
-- operation: drop_table key=table:rudel.session_analytics_backup_20260403 risk=danger
DROP TABLE IF EXISTS rudel.session_analytics_backup_20260403 SYNC;
-- operation: drop_table key=table:rudel.session_analytics_broken risk=danger
DROP TABLE IF EXISTS rudel.session_analytics_broken SYNC;
