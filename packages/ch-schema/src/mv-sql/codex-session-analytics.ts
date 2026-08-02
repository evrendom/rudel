import {
	ANALYTICS_CONTENT_BYTE_LIMIT,
	ANALYTICS_TRANSCRIPT_LINE_LIMIT,
} from "./counting-correctness.js";
import { SESSION_ERROR_PATTERN_SQL } from "./session-error-pattern.js";
import { SESSION_SUCCESS_SCORE_SQL } from "./session-success-score.js";

/**
 * Kept outside `src/db/schema/**` so chkit does not discover it as a schema
 * entrypoint. The schema, migration generator, and regression tests import this
 * single SQL source.
 */
export const CODEX_SESSION_ANALYTICS_MV_SQL = `
  SELECT * EXCEPT (_dedupe_rank)
  FROM (
  WITH
    (
      length(cs.content) > ${ANALYTICS_CONTENT_BYTE_LIMIT}
      OR countSubstrings(cs.content, '\\n') > ${ANALYTICS_TRANSCRIPT_LINE_LIMIT}
    ) AS _is_capped,

    arraySlice(
      splitByChar(
        '\\n',
        substring(cs.content, 1, ${ANALYTICS_CONTENT_BYTE_LIMIT})
      ),
      1,
      ${ANALYTICS_TRANSCRIPT_LINE_LIMIT}
    ) AS _all_lines,

    substring(cs.content, 1, 20000000) AS _error_sample_content,

    arrayFilter(
      x -> isNotNull(x.2),
      arrayMap(
        x -> tuple(
          x,
          parseDateTime64BestEffortOrNull(JSONExtractString(x, 'timestamp'))
        ),
        _all_lines
      )
    ) AS _timestamped_lines,

    arrayMap(x -> assumeNotNull(x.2), _timestamped_lines) AS _timestamps,

    if(
      length(_timestamps) > 1,
      arrayMap(
        i -> greatest(
          dateDiff('second', _timestamps[i], _timestamps[i + 1]),
          0
        ),
        range(1, length(_timestamps))
      ),
      []
    ) AS _prompt_periods_sec,

    if(
      length(_timestamps) > 1,
      arrayMap(
        i -> greatest(
          dateDiff('second', _timestamps[i], _timestamps[i + 1]),
          0
        ),
        range(1, length(_timestamps))
      ),
      []
    ) AS _inference_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('response_item', 'event_msg'),
      _all_lines
    ) AS _interaction_lines,

    arrayFilter(
      x ->
        JSONExtractString(x, 'type') = 'response_item'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') =
          'function_call_output',
      _all_lines
    ) AS _tool_output_lines,

    arrayFilter(
      x ->
        JSONExtractString(x, 'type') = 'event_msg'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') =
          'token_count'
        AND JSONHas(JSONExtractRaw(x, 'payload'), 'info')
        AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null'
        AND JSONHas(
          JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'),
          'total_token_usage'
        )
        AND JSONHas(
          JSONExtractRaw(
            JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'),
            'total_token_usage'
          ),
          'input_tokens'
        )
        AND JSONHas(
          JSONExtractRaw(
            JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'),
            'total_token_usage'
          ),
          'output_tokens'
        )
        AND JSONHas(
          JSONExtractRaw(
            JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info'),
            'total_token_usage'
          ),
          'cached_input_tokens'
        ),
      _all_lines
    ) AS _token_count_lines,

    arrayMap(
      line -> JSONExtractRaw(
        JSONExtractRaw(JSONExtractRaw(line, 'payload'), 'info'),
        'total_token_usage'
      ),
      _token_count_lines
    ) AS _usage_objects,

    arrayMap(
      usage -> tuple(
        toUInt64OrZero(JSONExtractRaw(usage, 'input_tokens')),
        toUInt64OrZero(JSONExtractRaw(usage, 'cached_input_tokens')),
        toUInt64OrZero(JSONExtractRaw(usage, 'output_tokens'))
      ),
      _usage_objects
    ) AS _usage_snapshots,

    arrayFilter(
      i ->
        i > 1
        AND (
          _usage_snapshots[i].1 < _usage_snapshots[i - 1].1
          OR _usage_snapshots[i].2 < _usage_snapshots[i - 1].2
          OR _usage_snapshots[i].3 < _usage_snapshots[i - 1].3
        ),
      arrayEnumerate(_usage_snapshots)
    ) AS _reset_indices,

    if(
      length(_usage_snapshots) > 0,
      arrayConcat(
        arrayMap(i -> i - 1, _reset_indices),
        [length(_usage_snapshots)]
      ),
      []
    ) AS _segment_end_indices,

    arraySum(
      arrayMap(i -> _usage_snapshots[i].1, _segment_end_indices)
    ) AS _input_tokens,
    arraySum(
      arrayMap(i -> _usage_snapshots[i].2, _segment_end_indices)
    ) AS _cache_read_input_tokens,
    arraySum(
      arrayMap(i -> _usage_snapshots[i].3, _segment_end_indices)
    ) AS _output_tokens,

    if(length(_timestamps) > 0, arrayMin(_timestamps), cs.session_date) AS _session_date,
    if(
      length(_timestamps) > 0,
      arrayMax(_timestamps),
      cs.last_interaction_date
    ) AS _last_interaction_date,
    greatest(
      dateDiff('minute', _session_date, _last_interaction_date),
      0
    ) AS _duration_min,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'session_meta',
      _all_lines
    ) AS _meta_lines,

    if(
      length(_meta_lines) > 0,
      JSONExtractString(
        JSONExtractRaw(arrayElement(_meta_lines, -1), 'payload'),
        'model_provider'
      ),
      ''
    ) AS _model_provider,

    arrayFilter(
      x ->
        JSONExtractString(x, 'type') = 'turn_context'
        AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'model') != ''
        AND JSONExtractString(
          JSONExtractRaw(x, 'payload'),
          'model'
        ) != '<synthetic>',
      _all_lines
    ) AS _turn_context_lines,

    if(
      length(_turn_context_lines) > 0,
      JSONExtractString(
        JSONExtractRaw(arrayElement(_turn_context_lines, -1), 'payload'),
        'model'
      ),
      ''
    ) AS _model_from_turn_context,

    arrayDistinct(
      arrayFilter(
        x -> x != '',
        extractAll(
          cs.content,
          '"name":"exec_command"[^}]*skills/([a-zA-Z0-9_-]+)/SKILL'
        )
      )
    ) AS _skills,

    toUInt32(
      length(
        extractAll(_error_sample_content, '\\\\"exit_code\\\\":[1-9][0-9]*')
      )
      + if(
          _is_capped,
          length(
            extractAll(
              _error_sample_content,
              '([A-Z][a-zA-Z]+Error):'
            )
          )
            + length(
              extractAll(
                _error_sample_content,
                '([A-Z][a-zA-Z]+Exception):'
              )
            ),
          arrayCount(
            x -> x ILIKE '%Error:%' OR x ILIKE '%Exception:%',
            _tool_output_lines
          )
        )
    ) AS _error_count

  SELECT
    * EXCEPT (session_date, last_interaction_date, content),
    _session_date AS session_date,
    _last_interaction_date AS last_interaction_date,
    'codex' AS source,
    _input_tokens AS input_tokens,
    _output_tokens AS output_tokens,
    _cache_read_input_tokens AS cache_read_input_tokens,
    toUInt64(0) AS cache_creation_input_tokens,
    toUInt64(0) AS cache_creation_5m_input_tokens,
    toUInt64(0) AS cache_creation_1h_input_tokens,
    _input_tokens + _output_tokens AS total_tokens,
    toUInt8(_is_capped) AS is_capped,
    toUInt8(0) AS stale_extraction,
    _skills AS skills,
    [] :: Array(String) AS slash_commands,
    [] :: Array(String) AS subagent_types,
    toUInt32(length(_interaction_lines)) AS total_interactions,
    toUInt32(_duration_min) AS actual_duration_min,
    if(
      length(_prompt_periods_sec) > 0,
      round(arrayAvg(_prompt_periods_sec), 2),
      0
    ) AS avg_period_sec,
    if(
      length(_prompt_periods_sec) > 0,
      toFloat64(
        arrayElement(
          arraySort(_prompt_periods_sec),
          toUInt64(ceil(length(_prompt_periods_sec) / 2))
        )
      ),
      0
    ) AS median_period_sec,
    toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) AS quick_responses,
    toUInt32(
      arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)
    ) AS normal_responses,
    toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) AS long_pauses,
    _error_count AS error_count,
    ${SESSION_ERROR_PATTERN_SQL} AS error_pattern,
    multiIf(
      _model_from_turn_context != '', _model_from_turn_context,
      _model_provider != '' AND _model_provider != '<synthetic>', _model_provider,
      'unknown'
    ) AS model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) AS has_commit,
    toUInt8(0) AS used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) AS inference_duration_sec,
    toUInt32(0) AS human_duration_sec,
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
    END AS session_archetype,
    ${SESSION_SUCCESS_SCORE_SQL} AS success_score,
    ROW_NUMBER() OVER (
      PARTITION BY cs.organization_id, cs.user_id, cs.session_id
      ORDER BY cs.ingested_at DESC
    ) AS _dedupe_rank

  FROM rudel.codex_sessions AS cs
  )
  WHERE _dedupe_rank = 1`;
