# Usage-events backfill

This runbook fills the request-level `rudel.usage_events` table from retained
raw transcripts. It does not modify either raw-session table and does not
require ingest quiescence.

The side-by-side report is a regression and coverage check. It is not evidence
of billing truth; provider anchors and client attestation remain the external
authorities.

## Safety model

- Preview is read-only and prints the exact cutoff required for execution.
- Only latest raw snapshots containing provider usage telemetry are extracted.
  Sessions without usage telemetry cannot produce a token fact; the receipt
  reports both the full raw-session census and the exact skipped count.
- The full raw-session census is explicitly bounded by `--max-sessions`.
- Raw reads are grouped by source, organization, and UTC month, then capped at
  64 sessions and approximately 128 MiB per response.
- The execution path reserves a Postgres generation only if the previewed raw
  content is still current. A concurrent live upload either prevents the
  reservation or receives a higher generation and wins.
- A complete, consistency-checked ClickHouse receipt is recorded in Postgres
  last. Re-running the same cutoff skips that content without adding physical
  rows.

## 1. Preview

Use the production operator environment. Set the organization filter when
performing a staged run; omit it only for the final fleet-wide run.

```bash
bun run --cwd apps/api backfill:usage-events -- \
  --organization-id ORGANIZATION_ID \
  --max-sessions REVIEWED_UPPER_BOUND
```

Save the complete JSON receipt. The preview gate is:

- `failedCount = 0`
- `incompleteCount = 0`
- `oversizedCount = 0`
- `supersededCount = 0`
- `completeCount = candidateCount`
- `wouldWriteCount + alreadyCompleteCount = candidateCount`

Review `rawSessionCount`, `candidateCount`, and `skippedNoUsageCount`. A higher
raw census requires an explicit larger `--max-sessions`; the tool never
raises its own bound.

## 2. Execute the identical snapshot

Pass the exact preview `cutoff` and the same organization and size bounds.

```bash
bun run --cwd apps/api backfill:usage-events -- \
  --execute \
  --cutoff 2026-01-01T00:00:00.000Z \
  --organization-id ORGANIZATION_ID \
  --max-sessions REVIEWED_UPPER_BOUND
```

The execution gate is the preview gate plus:

- `completedCount + alreadyCompleteCount = candidateCount`
- process exit code `0`

If execution exits nonzero, keep live ingest enabled, retain the JSON receipt,
and rerun the same command after diagnosing the listed sessions. Completed
sessions are idempotently skipped.

## 3. Side-by-side coverage and token classes

```bash
bun run --cwd apps/api compare:usage-events -- \
  --organization-id ORGANIZATION_ID \
  --max-sessions REVIEWED_UPPER_BOUND \
  --top-sessions 20 \
  --require-complete
```

`--require-complete` fails when a token-bearing legacy session lacks a complete
usage receipt or when active event rows have no receipt. Expected token deltas
remain visible by provider and in the top-session list; they are not required
to be zero because the new extractor deliberately fixes attribution and dedupe
semantics.

Do not cut over pricing endpoints or make accuracy claims from this report
alone. Continue with the provider-anchor and client-checksum gates.
