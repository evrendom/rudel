# Claude Token Accounting V2

This document explains the Anthropic-grounded Claude token accounting model introduced in the stacked PR on top of the Codex accounting work.

## Why this exists

The old Claude pipeline mixed three incompatible ideas:

- Anthropic `usage.input_tokens`, which is the uncached input suffix
- Rudel `session_analytics.input_tokens`, which was intended to mean processed input
- A ClickHouse materialized view that summed every assistant usage line in the parent transcript, including repeated streamed updates for the same `message.id`

That produced two different classes of bugs at the same time:

- Claude chart/detail surfaces could look too low because they only read `usage.input_tokens`
- Claude aggregate/session rows could look too high because duplicate assistant usage rows were summed repeatedly

## Anthropic rules this implementation follows

Source of truth:

- `https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching`
- `https://docs.anthropic.com/en/api/messages-streaming`
- `https://docs.anthropic.com/en/api/usage-cost-api`

Canonical Anthropic semantics:

- `usage.input_tokens` is uncached input
- processed input is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
- streamed usage is cumulative for a given response
- the final token total for one Claude response is the last usage snapshot for that `message.id`

## Rudel V2 decisions

These are intentional product and data-model decisions, not implementation accidents.

### 1. `input_tokens` means processed input

For Claude rows in `session_analytics`, `input_tokens` now means total processed input, not just Anthropic uncached input.

Derived field:

- `uncached_input_tokens = input_tokens - cache_read_input_tokens - cache_creation_input_tokens`

### 2. The counting unit is one final assistant snapshot per `message.id`

Claude streams can emit multiple assistant lines with the same `message.id` as output grows. V2 groups those lines by `message.id` and keeps the last usage snapshot in transcript order.

This prevents duplicate streamed updates from inflating totals.

### 3. Session token totals include subagents

Parent transcript totals and subagent transcript totals are computed separately, then folded into the session-wide token totals:

- `session = parent + subagents`

This is why already-uploaded raw Claude sessions can be corrected without user reupload. The raw parent transcript and raw subagent transcripts are already stored in `rudel.claude_sessions`.

### 4. Timing metrics remain parent-scoped

`total_interactions`, `duration`, `avg_period_sec`, `inference_duration_sec`, and `human_duration_sec` remain based on the parent transcript only.

That is deliberate:

- tokens measure total work performed by the session, including subagents
- timing metrics measure the parent human conversation rhythm

Mixing subagent token work into timing metrics would make session pacing harder to interpret.

### 5. The ClickHouse MV is now a bootstrap path, not the Claude token authority

The existing Claude MV still writes an initial `session_analytics` row. The API then writes a corrected replacement row with a newer `ingested_at` and `token_accounting_version = 2`.

This keeps the transition safe while moving the Claude token truth into shared TypeScript code that can be used by:

- ingest correction
- historical backfill
- session detail breakdown
- Claude token charts

## Storage changes

`rudel.session_analytics` now stores:

- `parent_input_tokens`
- `parent_output_tokens`
- `parent_cache_read_input_tokens`
- `parent_cache_creation_input_tokens`
- `parent_total_tokens`
- `subagent_input_tokens`
- `subagent_output_tokens`
- `subagent_cache_read_input_tokens`
- `subagent_cache_creation_input_tokens`
- `subagent_total_tokens`
- `token_accounting_version`

These columns make the corrected Claude totals explainable in the database instead of hiding the relationship in application code only.

## API and UI changes

`SessionDetail` now exposes:

- processed input
- uncached input
- cache read
- cache write
- parent totals
- subagent totals
- a token timeline based on the canonical final-per-message accounting

The Claude session detail card surfaces the exact processed-input breakdown so reviewers can reconcile the session totals visually.

The internal Claude token chart path also uses processed input now, rather than Anthropic uncached input alone.

## Historical correction

No user reupload is required for already-uploaded Claude sessions.

Run the backfill with Rudel env loaded:

```bash
doppler run --project rudel --config prd -- \
  bun run --cwd apps/api backfill:claude-token-accounting -- --batch-size 100
```

Optional flags:

- `--offset <n>`
- `--max-sessions <n>`

The backfill reads the latest raw row per Claude `session_id` from `rudel.claude_sessions`, rebuilds the V2 analytics row, and appends a replacement row into `rudel.session_analytics`.

Because `session_analytics` is a `ReplacingMergeTree(ingested_at)`, `FINAL` will pick the corrected row.

## Verification checklist

The implementation is behaving correctly when all of the following are true:

- `input_tokens = uncached_input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
- `total_tokens = input_tokens + output_tokens`
- `parent_total_tokens + subagent_total_tokens = total_tokens`
- Claude session detail totals match the raw transcript reconstruction
- Claude aggregate rows stop inflating duplicate streamed assistant updates

## Scope boundary

This PR does not remove the old Claude MV yet. It makes V2 authoritative by appending corrected rows on ingest and via backfill, which is the safer migration path for a production analytics table already in use.
