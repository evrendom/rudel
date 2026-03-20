import { materializedView, schema, table } from "@chkit/core";
import { baseSessionColumns, baseSessionTableConfig } from "./base-sessions.js";

const rudel_pi_sessions = table({
	database: "rudel",
	name: "pi_sessions",
	engine: "SharedReplacingMergeTree(ingested_at)",
	columns: [
		...baseSessionColumns,
		{ name: "version", type: "UInt8", default: "fn:0" },
		{ name: "subagents", type: "Map(String, String)", default: "fn:map()" },
	],
	...baseSessionTableConfig,
});

// v2 MV: Pi subagent content is in Claude Code JSONL format (type: "user"/"assistant")
// Mirrors the Claude Code session_analytics_mv logic from session-analytics.ts
const pi_v2_session_analytics_mv = materializedView({
	database: "rudel",
	name: "pi_v2_session_analytics_mv",
	to: { database: "rudel", name: "session_analytics" },
	as: `
  WITH
    arrayFilter(
      x -> JSONExtractString(x, 'type') IN ('user', 'assistant'),
      splitByChar('\\n', ps.content)
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
      splitByChar('\\n', ps.content)
    ) AS _assistant_lines,

    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'input_tokens')), _assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'output_tokens')), _assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_read_input_tokens')), _assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> toUInt64OrZero(JSONExtractRaw(JSONExtractRaw(x, 'message'), 'usage', 'cache_creation_input_tokens')), _assistant_lines)) AS _cache_creation,

    arrayMin(_timestamps) AS _session_date,
    arrayMax(_timestamps) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, version),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'pi' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    [] :: Array(String) as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
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
    toUInt32(0) as error_count,
    JSONExtractString(
      JSONExtractRaw(
        arrayElement(
          arrayFilter(
            x -> JSONExtractString(x, 'type') = 'assistant',
            splitByChar('\\n', ps.content)
          ),
          -1
        ),
        'message'
      ),
      'model'
    ) as model_used,
    toUInt8(if(ps.git_sha IS NOT NULL AND ps.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND ps.git_sha IS NOT NULL AND ps.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,
    toUInt8(round(
      50
      + (if(ps.git_sha IS NOT NULL AND ps.git_sha != '', 20, 0))
      + (if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0))
      - (if((_input_tokens + _output_tokens) > 1500000 AND (ps.git_sha IS NULL OR ps.git_sha = ''), 20, 0))
      - (if(_duration_min < 2 AND _output_tokens < 200, 30, 0))
    )) as success_score

  FROM rudel.pi_sessions AS ps
  WHERE ps.version = 2 AND length(_timestamps) > 0
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ps.session_id ORDER BY ps.ingested_at DESC) = 1`,
});

// v3 MV: Pi native JSONL format
// Lines have type:"message" with nested message:{role, content, model, usage:{input, output, cacheRead, cacheWrite}}
const pi_v3_session_analytics_mv = materializedView({
	database: "rudel",
	name: "pi_v3_session_analytics_mv",
	to: { database: "rudel", name: "session_analytics" },
	as: `
  WITH
    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'message'
        AND JSONExtractString(JSONExtractRaw(x, 'message'), 'role') IN ('user', 'assistant'),
      splitByChar('\\n', ps.content)
    ) AS _interaction_lines,

    arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,

    arrayMap(
      x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')),
      _ts_lines
    ) AS _timestamps,

    arrayMap(
      x -> JSONExtractString(JSONExtractRaw(x, 'message'), 'role'),
      _ts_lines
    ) AS _msg_roles,

    if(length(_timestamps) > 1,
      arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))),
      []
    ) AS _prompt_periods_sec,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_roles[i] = 'user' AND _msg_roles[i+1] = 'assistant',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _inference_gaps,

    if(length(_timestamps) > 1,
      arrayMap(i -> if(_msg_roles[i] = 'assistant' AND _msg_roles[i+1] = 'user',
        dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))),
      []
    ) AS _human_gaps,

    arrayFilter(
      x -> JSONExtractString(x, 'type') = 'message'
        AND JSONExtractString(JSONExtractRaw(x, 'message'), 'role') = 'assistant',
      splitByChar('\\n', ps.content)
    ) AS _assistant_lines,

    arraySum(arrayMap(x -> JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'input'), _assistant_lines)) AS _input_tokens,
    arraySum(arrayMap(x -> JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'output'), _assistant_lines)) AS _output_tokens,
    arraySum(arrayMap(x -> JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'cacheRead'), _assistant_lines)) AS _cache_read,
    arraySum(arrayMap(x -> JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'cacheWrite'), _assistant_lines)) AS _cache_creation,

    arrayMin(_timestamps) AS _session_date,
    arrayMax(_timestamps) AS _last_interaction_date,
    dateDiff('minute', _session_date, _last_interaction_date) AS _duration_min

  SELECT
    * EXCEPT (session_date, last_interaction_date, version),
    _session_date as session_date,
    _last_interaction_date as last_interaction_date,
    'pi' as source,
    _input_tokens as input_tokens,
    _output_tokens as output_tokens,
    _cache_read as cache_read_input_tokens,
    _cache_creation as cache_creation_input_tokens,
    _input_tokens + _output_tokens as total_tokens,
    [] :: Array(String) as skills,
    [] :: Array(String) as slash_commands,
    [] :: Array(String) as subagent_types,
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
    toUInt32(0) as error_count,
    JSONExtractString(
      JSONExtractRaw(
        arrayElement(_assistant_lines, -1),
        'message'
      ),
      'model'
    ) as model_used,
    toUInt8(if(ps.git_sha IS NOT NULL AND ps.git_sha != '', 1, 0)) as has_commit,
    toUInt8(0) as used_plan_mode,
    toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
    toUInt32(arraySum(_human_gaps)) as human_duration_sec,
    CASE
      WHEN _duration_min <= 10
          AND (_input_tokens + _output_tokens) < 500000
          AND _output_tokens > 1000
      THEN 'quick_win'
      WHEN _duration_min > 30
          AND _output_tokens > 50000
          AND ps.git_sha IS NOT NULL AND ps.git_sha != ''
      THEN 'deep_work'
      WHEN (_input_tokens + _output_tokens) > 1000000
          AND (_output_tokens / nullif(_input_tokens, 0)) < 0.3
          AND _duration_min > 20
      THEN 'struggle'
      WHEN _duration_min < 3
          AND _output_tokens < 500
      THEN 'abandoned'
      ELSE 'standard'
    END as session_archetype,
    toUInt8(round(
      50
      + (if(ps.git_sha IS NOT NULL AND ps.git_sha != '', 20, 0))
      + (if((_output_tokens / nullif(_input_tokens, 0)) > 0.5, 15, 0))
      - (if((_input_tokens + _output_tokens) > 1500000 AND (ps.git_sha IS NULL OR ps.git_sha = ''), 20, 0))
      - (if(_duration_min < 2 AND _output_tokens < 200, 30, 0))
    )) as success_score

  FROM rudel.pi_sessions AS ps
  WHERE ps.version = 3 AND length(_timestamps) > 0
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ps.session_id ORDER BY ps.ingested_at DESC) = 1`,
});

export default schema(
	rudel_pi_sessions,
	pi_v2_session_analytics_mv,
	pi_v3_session_analytics_mv,
);
