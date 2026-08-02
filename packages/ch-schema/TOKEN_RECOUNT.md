# Independent token recount

`tokens:recount` is the PR-0 baseline for token and cost accuracy. It reads the
latest raw Claude and Codex transcripts with `argMax(content, ingested_at)`,
parses token usage without importing either materialized-view query or either
agent adapter, and compares each token class with `session_analytics FINAL`.

The four compared classes are uncached input, cache read, cache creation, and
output. Claude cache creation also retains its 5-minute/1-hour split so the
later counting migration can be checked without another baseline tool.

## Safety boundary

- Every run requires one `organization_id`. In this schema that value is the
  transcript owner's user ID, not the product organization's Postgres ID.
- Production uses only `CLICKHOUSE_READONLY_*` credentials, requires HTTPS,
  and rejects the `default` identity.
- Queries are hard-coded read shapes with time, scan, memory, and result caps.
- Raw contents are processed in memory one session at a time and are never
  written to the report. Request IDs are represented only by short hashes in
  fork-replay evidence.

## Run it

Local ClickHouse:

```sh
bun run tokens:recount -- --organization-id <storage-owner-id>
```

Production read-only certification:

```sh
bun run tokens:recount -- \
  --target prod \
  --organization-id <storage-owner-id> \
  --lookback-days 365 \
  --sample-size 100 \
  --require-anchors \
  --require-feature-anchors \
  --require-zero-diff
```

Reports are written as JSON and Markdown under
`.context/reports/token-recount/`. Timestamped files preserve each run;
`latest-local.*` and `latest-prod.*` point to the newest result.

## Provider anchor file

The default path is `.context/token-recount-anchors.json`. Anchor values must
come from controlled sessions on dedicated provider API keys. Do not infer or
copy values from `session_analytics`; the provider dashboard/usage API is the
ground truth.

```json
{
  "version": 1,
  "anchors": [
    {
      "name": "controlled Claude anchor",
      "source": "claude_code",
      "organization_id": "storage-owner-id",
      "user_id": "user-id",
      "session_id": "session-id",
      "verified_at": "2026-08-02T12:00:00.000Z",
      "evidence_reference": ".context/anchors/claude-provider-usage.png",
      "features": ["cache_1h", "subagent_heavy"],
      "provider_tokens": {
        "uncached_input_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_5m_input_tokens": 0,
        "cache_creation_1h_input_tokens": 0,
        "output_tokens": 0
      }
    }
  ]
}
```

`--require-anchors` passes only when at least one Claude and one Codex anchor
are present, both raw sessions are still inside the 365-day TTL, and every
token class matches exactly.

After the counting-correctness migration, scheduled runs use
`--require-zero-diff`; any missing analytics row, invariant violation, or
stored/recount token difference exits nonzero.

Scheduled certification also uses `--require-feature-anchors`. Across the
passing provider anchors, `features` must cover `cache_1h`, `long_context`,
`intro_boundary`, `multi_model`, `subagent_heavy`, `capped`, and
`codex_resume`; missing coverage fails instead of silently narrowing the suite.

## Scheduled verification configuration

The `token-cost-verification.yml` workflow requires the repository secrets
`CLICKHOUSE_READONLY_URL`, `CLICKHOUSE_READONLY_USERNAME`,
`CLICKHOUSE_READONLY_PASSWORD`, `TOKEN_RECOUNT_ORGANIZATION_ID`, and
`TOKEN_RECOUNT_ANCHORS_JSON`. The anchor secret contains the complete version-1
JSON document shown above.

Set `TOKEN_COST_ALERT_ASSIGNEE` as a repository variable to the GitHub login
that owns token-cost incidents. If it is absent, the workflow assigns the actor
associated with the scheduled workflow. `PRICING_ALLOWED_UNRESOLVED_MODELS` is
an optional comma-separated repository variable for intentionally unpriced
legacy model IDs; every new unresolved ID still fails the daily coverage job.

## Continuous invariants

[`queries/token-class-invariants.sql`](queries/token-class-invariants.sql) is
the scheduled read-only query. Run it once per storage owner with
`organizationId` and `lookbackDays` parameters. All five returned counts must
be zero. It checks both provider class identities, `total = input + output`,
and that re-uploaded raw identities still collapse to one analytics row under
`FINAL`.

CI fixtures live in `src/token-recount/*.test.ts` and
`scripts/token-recount/*.test.ts`. The existing real-ClickHouse test in
`apps/api/src/__tests__/session-analytics-values.integration.ts` remains the
end-to-end re-upload idempotence fixture.
