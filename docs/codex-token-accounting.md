# Codex Token Accounting

This document is the source of truth for how Rudel should interpret Codex token usage and estimated cost.

## Canonical semantics

For `rudel.session_analytics` rows with `source = 'codex'`:

- `input_tokens` means all provider-reported input processed by the model.
- `cache_read_input_tokens` is a subset of `input_tokens`.
- `cache_creation_input_tokens` is currently `0` for Codex rows.
- `output_tokens` means all provider-reported output processed by the model.
- `total_tokens` must equal `input_tokens + output_tokens`.

For estimated pricing, only uncached input should be charged at the full input-token rate:

```text
base_rate_input_tokens =
  max(input_tokens - cache_read_input_tokens - cache_creation_input_tokens, 0)

estimated_cost =
  base_rate_input_tokens * input_rate
  + cache_read_input_tokens * cached_input_rate
  + cache_creation_input_tokens * cache_write_rate
  + output_tokens * output_rate
```

## What went wrong

Two issues drifted apart at the same time:

1. Historical Codex analytics rows were written with mixed `input_tokens` semantics.
   - Older rows stored `input_tokens = raw_input - cached_input`.
   - Newer rows store `input_tokens = raw_input`.
2. Estimated pricing charged `input_tokens` at the full input rate and then charged cached input again at the cached rate.

That combination made Codex usage look wrong in two different ways:

- Session and aggregate token charts mixed incompatible definitions of “input”.
- Cached Codex input was double-counted in estimated cost.

## Live data shape that triggered this fix

The validation query run against ClickHouse on 2026-04-23 returned:

- `31` Codex rows checked in `rudel.session_analytics FINAL`
- `31` rows whose `output_tokens` matched the raw Codex `token_count` event
- `31` rows whose `cache_read_input_tokens` matched the raw Codex `token_count` event
- `24` rows whose stored `input_tokens` matched `raw_input - cached_input`
- `8` rows whose stored `input_tokens` matched raw `input_tokens`

That means the cost bug and the token-accounting bug were both real in live data, not just in source code.

## What this change does

### Backend

- Fixes `packages/api-routes/src/model-pricing.ts` so cached input and cache writes are removed from the full-rate input bucket before cost is calculated.
- Replaces remaining hard-coded token-cost formulas in `apps/api/src/services/project.service.ts` and `apps/api/src/services/roi.service.ts` with the shared pricing SQL helper.

### Frontend

- Fixes `apps/web/src/lib/codex-conversation-parser.ts` so Codex token deltas use provider-reported cumulative input tokens instead of `input - cached_input`.
- Fixes `apps/web/src/features/conversation-internal/lib/conversation-analysis.ts` so Codex transcripts use the Codex token extractor.
- Fixes `apps/web/src/features/conversation-internal/lib/conversation-schema.ts` so the internal conversation view parses Codex transcripts instead of falling back to the Claude-only parser.

### Data correction

- Adds `packages/ch-schema/chx/migrations/20260423161000_auto.sql`.
- The migration reinserts the latest canonical Codex projection into `rudel.session_analytics` with a fresh `ingested_at`.
- Because `session_analytics` is a `ReplacingMergeTree(ingested_at)`, `FINAL` will prefer the corrected Codex row for each `(organization_id, session_date, session_id)` key.

## Why a backfill is required

Recreating the materialized view is not enough. Existing rows already written into `rudel.session_analytics` keep their old `input_tokens` values until they are replaced.

Without the backfill:

- new Codex sessions look correct,
- old Codex sessions stay wrong,
- aggregate dashboards still mix both definitions.

## Validation query

Use this to compare stored Codex analytics rows with the raw final `token_count` payload:

```sql
WITH raw_codex AS (
  SELECT
    session_id,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'input_tokens')) AS raw_input_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'output_tokens')) AS raw_output_tokens,
    toUInt64OrZero(JSONExtractRaw(_final_usage, 'cached_input_tokens')) AS raw_cached_input_tokens
  FROM (
    SELECT
      session_id,
      if(length(_token_count_lines) > 0,
        JSONExtractRaw(JSONExtractRaw(JSONExtractRaw(arrayElement(_token_count_lines, -1), 'payload'), 'info'), 'total_token_usage'),
        '{}'
      ) AS _final_usage
    FROM (
      SELECT
        session_id,
        arrayFilter(
          x -> JSONExtractString(x, 'type') = 'event_msg'
            AND JSONExtractString(JSONExtractRaw(x, 'payload'), 'type') = 'token_count'
            AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') IS NOT NULL
            AND JSONExtractRaw(JSONExtractRaw(x, 'payload'), 'info') != 'null',
          splitByChar('\n', content)
        ) AS _token_count_lines
      FROM rudel.codex_sessions FINAL
    )
  )
)
SELECT
  count() AS total_codex_rows,
  countIf(sa.input_tokens = rc.raw_input_tokens) AS matches_raw_input,
  countIf(sa.input_tokens = rc.raw_input_tokens - rc.raw_cached_input_tokens) AS matches_uncached_input,
  countIf(sa.output_tokens = rc.raw_output_tokens) AS matches_output,
  countIf(sa.cache_read_input_tokens = rc.raw_cached_input_tokens) AS matches_cached
FROM rudel.session_analytics FINAL AS sa
INNER JOIN raw_codex AS rc USING (session_id)
WHERE sa.source = 'codex';
```

After the backfill, `matches_raw_input` should equal `total_codex_rows` and `matches_uncached_input` should only reflect rows where `cached_input_tokens = 0`.
