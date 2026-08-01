import { SESSION_ERROR_PATTERN_SQL } from "./session-error-pattern.js";
import { SESSION_SUCCESS_SCORE_SQL } from "./session-success-score.js";

/**
 * Kept outside `src/db/schema/**` so chkit does not discover it as a schema
 * entrypoint. The schema and its regression tests import this single SQL source.
 */
export const CLAUDE_SESSION_ANALYTICS_MV_SQL = `
  SELECT * EXCEPT (_dedupe_rank)
  FROM (
  WITH
    (
      length(cs.content) > 120000000
      OR countSubstrings(cs.content, '\\n') > 8000
    ) AS _is_capped,

    if(_is_capped, '', cs.content) AS _line_safe_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\\n', _line_safe_content)
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
      splitByChar('\\n', _line_safe_content)
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
    ${SESSION_ERROR_PATTERN_SQL} as error_pattern,
    if(
      _is_capped,
      '',
      JSONExtractString(
        JSONExtractRaw(
          arrayElement(
            arrayFilter(
              x -> JSONExtractString(x, 'type') = 'assistant',
              splitByChar('\\n', _line_safe_content)
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
    ${SESSION_SUCCESS_SCORE_SQL} as success_score,
    ROW_NUMBER() OVER (
      PARTITION BY cs.organization_id, cs.user_id, cs.session_id
      ORDER BY cs.ingested_at DESC
    ) AS _dedupe_rank

  FROM rudel.claude_sessions AS cs
  WHERE _is_capped OR length(_timestamps) > 0
  )
  WHERE _dedupe_rank = 1`;
