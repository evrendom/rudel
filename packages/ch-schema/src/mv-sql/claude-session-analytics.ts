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
export const CLAUDE_SESSION_ANALYTICS_MV_SQL = `
  SELECT * EXCEPT (_dedupe_rank)
  FROM (
  WITH
    arrayConcat(
      [tuple('main', cs.content)],
      arrayMap(
        (name, content) -> tuple(concat('subagent:', name), content),
        mapKeys(cs.subagents),
        mapValues(cs.subagents)
      )
    ) AS _transcripts,

    arrayExists(
      transcript ->
        length(transcript.2) > ${ANALYTICS_CONTENT_BYTE_LIMIT}
        OR countSubstrings(transcript.2, '\\n') > ${ANALYTICS_TRANSCRIPT_LINE_LIMIT},
      _transcripts
    ) AS _is_capped,

    arraySlice(
      splitByChar(
        '\\n',
        substring(cs.content, 1, ${ANALYTICS_CONTENT_BYTE_LIMIT})
      ),
      1,
      ${ANALYTICS_TRANSCRIPT_LINE_LIMIT}
    ) AS _main_lines,

    arrayFlatten(
      arrayMap(
        transcript -> arraySlice(
          splitByChar(
            '\\n',
            substring(transcript.2, 1, ${ANALYTICS_CONTENT_BYTE_LIMIT})
          ),
          1,
          ${ANALYTICS_TRANSCRIPT_LINE_LIMIT}
        ),
        _transcripts
      )
    ) AS _token_safe_lines,

    substring(cs.content, 1, 20000000) AS _error_sample_content,

    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      _main_lines
    ) AS _interaction_lines,

    arrayFilter(
      x -> isNotNull(x.2),
      arrayMap(
        x -> tuple(
          x,
          parseDateTime64BestEffortOrNull(JSONExtractString(x, 'timestamp'))
        ),
        _interaction_lines
      )
    ) AS _timestamped_interactions,

    arrayMap(x -> assumeNotNull(x.2), _timestamped_interactions) AS _timestamps,
    arrayMap(
      x -> JSONExtractString(x.1, 'type'),
      _timestamped_interactions
    ) AS _msg_types,

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
        i -> if(
          _msg_types[i] = 'user' AND _msg_types[i + 1] = 'assistant',
          greatest(
            dateDiff('second', _timestamps[i], _timestamps[i + 1]),
            0
          ),
          0
        ),
        range(1, length(_timestamps))
      ),
      []
    ) AS _inference_gaps,

    if(
      length(_timestamps) > 1,
      arrayMap(
        i -> if(
          _msg_types[i] = 'assistant' AND _msg_types[i + 1] = 'user',
          greatest(
            dateDiff('second', _timestamps[i], _timestamps[i + 1]),
            0
          ),
          0
        ),
        range(1, length(_timestamps))
      ),
      []
    ) AS _human_gaps,

    arrayFilter(
      x ->
        JSONExtractString(x, 'type') = 'assistant'
        AND JSONHas(x, 'message')
        AND JSONHas(JSONExtractRaw(x, 'message'), 'usage'),
      _token_safe_lines
    ) AS _assistant_usage_lines,

    arrayMap(
      (line, sequence) -> tuple(
        multiIf(
          JSONExtractString(line, 'requestId') != '',
            concat('request:', JSONExtractString(line, 'requestId')),
          JSONExtractString(JSONExtractRaw(line, 'message'), 'id') != '',
            concat(
              'message:',
              JSONExtractString(JSONExtractRaw(line, 'message'), 'id')
            ),
          JSONExtractString(line, 'uuid') != '',
            concat('uuid:', JSONExtractString(line, 'uuid')),
          concat('line:', toString(sequence))
        ),
        parseDateTime64BestEffortOrNull(JSONExtractString(line, 'timestamp')),
        sequence,
        line
      ),
      _assistant_usage_lines,
      arrayEnumerate(_assistant_usage_lines)
    ) AS _usage_records,

    arrayDistinct(arrayMap(record -> record.1, _usage_records)) AS _usage_keys,

    arrayMap(
      key -> arrayElement(
        arraySort(
          record -> tuple(
            isNotNull(record.2),
            ifNull(record.2, toDateTime64(0, 3, 'UTC')),
            record.3
          ),
          arrayFilter(record -> record.1 = key, _usage_records)
        ),
        -1
      ),
      _usage_keys
    ) AS _deduped_usage_records,

    arrayMap(record -> record.4, _deduped_usage_records) AS _deduped_assistant_lines,
    arrayMap(
      line -> JSONExtractRaw(JSONExtractRaw(line, 'message'), 'usage'),
      _deduped_assistant_lines
    ) AS _usage_objects,

    arrayMap(
      usage -> toUInt64OrZero(JSONExtractRaw(usage, 'input_tokens')),
      _usage_objects
    ) AS _uncached_input_by_request,
    arrayMap(
      usage -> toUInt64OrZero(
        JSONExtractRaw(usage, 'cache_read_input_tokens')
      ),
      _usage_objects
    ) AS _cache_read_by_request,
    arrayMap(
      usage -> toUInt64OrZero(
        JSONExtractRaw(usage, 'cache_creation_input_tokens')
      ),
      _usage_objects
    ) AS _flat_cache_creation_by_request,
    arrayMap(
      usage -> toUInt64OrZero(
        JSONExtractRaw(
          JSONExtractRaw(usage, 'cache_creation'),
          'ephemeral_5m_input_tokens'
        )
      ),
      _usage_objects
    ) AS _nested_cache_creation_5m_by_request,
    arrayMap(
      usage -> toUInt64OrZero(
        JSONExtractRaw(
          JSONExtractRaw(usage, 'cache_creation'),
          'ephemeral_1h_input_tokens'
        )
      ),
      _usage_objects
    ) AS _nested_cache_creation_1h_by_request,
    arrayMap(
      usage -> toUInt64OrZero(JSONExtractRaw(usage, 'output_tokens')),
      _usage_objects
    ) AS _output_by_request,

    arraySum(_uncached_input_by_request) AS _uncached_input_tokens,
    arraySum(_cache_read_by_request) AS _cache_read,
    arraySum(_nested_cache_creation_1h_by_request) AS _cache_creation_1h,
    arraySum(
      arrayMap(
        (flat, five_minute, one_hour) ->
          greatest(flat, five_minute + one_hour) - one_hour,
        _flat_cache_creation_by_request,
        _nested_cache_creation_5m_by_request,
        _nested_cache_creation_1h_by_request
      )
    ) AS _cache_creation_5m,
    _cache_creation_5m + _cache_creation_1h AS _cache_creation,
    _uncached_input_tokens + _cache_read + _cache_creation AS _input_tokens,
    arraySum(_output_by_request) AS _output_tokens,

    arrayDistinct(
      arrayFilter(
        x -> x != '',
        extractAll(cs.content, '"name":"Skill"[^}]*"skill":"([^"]+)"')
      )
    ) AS _skills,
    arrayDistinct(
      arrayFilter(
        x -> x != '',
        extractAll(
          cs.content,
          '"name":"Task"[^}]*"subagent_type":"([^"]+)"'
        )
      )
    ) AS _subagent_types,
    arrayDistinct(
      arrayFilter(
        x -> x != '',
        extractAll(cs.content, '<command-name>/([^<]+)</command-name>')
      )
    ) AS _slash_commands,

    toUInt32(
      length(extractAll(_error_sample_content, '"isApiErrorMessage":true'))
      + length(extractAll(_error_sample_content, '"is_error":true'))
    ) AS _error_count,

    arrayFilter(
      line ->
        JSONExtractString(line, 'type') = 'assistant'
        AND JSONHas(line, 'message')
        AND JSONExtractString(JSONExtractRaw(line, 'message'), 'model') != ''
        AND JSONExtractString(
          JSONExtractRaw(line, 'message'),
          'model'
        ) != '<synthetic>',
      _main_lines
    ) AS _model_lines,

    if(
      length(_model_lines) > 0,
      JSONExtractString(
        JSONExtractRaw(arrayElement(_model_lines, -1), 'message'),
        'model'
      ),
      ''
    ) AS _model_used,

    if(length(_timestamps) > 0, arrayMin(_timestamps), cs.session_date) AS _session_date,
    if(
      length(_timestamps) > 0,
      arrayMax(_timestamps),
      cs.last_interaction_date
    ) AS _last_interaction_date,
    greatest(
      dateDiff('minute', _session_date, _last_interaction_date),
      0
    ) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, content, subagents),
    _session_date AS session_date,
    _last_interaction_date AS last_interaction_date,
    'claude_code' AS source,
    _input_tokens AS input_tokens,
    _output_tokens AS output_tokens,
    _cache_read AS cache_read_input_tokens,
    _cache_creation AS cache_creation_input_tokens,
    _cache_creation_5m AS cache_creation_5m_input_tokens,
    _cache_creation_1h AS cache_creation_1h_input_tokens,
    _input_tokens + _output_tokens AS total_tokens,
    toUInt8(_is_capped) AS is_capped,
    toUInt8(0) AS stale_extraction,
    _skills AS skills,
    _slash_commands AS slash_commands,
    _subagent_types AS subagent_types,
    toUInt32(length(_timestamps)) AS total_interactions,
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
    _model_used AS model_used,
    toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) AS has_commit,
    toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) AS used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) AS inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) AS human_duration_sec,
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

  FROM rudel.claude_sessions AS cs
  )
  WHERE _dedupe_rank = 1`;
