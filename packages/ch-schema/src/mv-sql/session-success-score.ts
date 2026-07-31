/**
 * Both session analytics materialized views use the same scoring formula.
 *
 * Starting with Float64 keeps the arithmetic signed. The final clamp prevents a
 * negative score from wrapping when ClickHouse converts it to UInt8.
 */
export const SESSION_SUCCESS_SCORE_SQL = `
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
)`;
