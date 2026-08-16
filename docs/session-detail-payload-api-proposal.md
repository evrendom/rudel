# Session Detail Payload API Proposal

Status: approved architecture proposal with amendments. This document authorizes
server-endpoint implementation through rollout steps 3–4. It does not authorize
the web cutover, a ClickHouse schema migration, or removal of the legacy
procedure.

## Decision summary

Replace the session detail screen's single eager payload with an additive,
three-part API:

1. Load session metadata, a bounded page of turn summaries, and subagent
   summaries first.
2. Load one turn body when that turn is selected.
3. Load a subagent transcript only when that subagent is expanded.

Keep the existing `analytics.sessions.detail` procedure during migration. Add
the new procedures alongside it, move the web route to them behind a rollout
guard, then remove the legacy procedure only after payload, metric-parity, and
behavior checks pass.

The contract schemas and ownership tests may begin immediately. The web cutover
is blocked on server-side per-turn cost parity with the existing request-level
client calculation.

## Measured baseline and target

The measured detail response for the investigated session is 18.3 MB:

- Main transcript `content`: 4.8 MB
- Eager subagent transcripts: 13.4 MB
- All remaining metadata: approximately 100 KB
- Comparable 30-day session list response: 59 KB

For that session, the initial detail request should be approximately 100–200 KB.
Every initial overview response must remain at or below 250 KB of serialized,
uncompressed JSON. Neither the main transcript body nor any subagent transcript
body may appear in that response.

The ceiling must hold by contract rather than by relying on the measured
session's 56-turn size:

- Normalize whitespace and truncate `userPreview` and `responsePreview` to at
  most 140 Unicode code points each.
- Return at most 100 turn summaries per overview page.
- Use a revision-bound cursor and return another page when the response would
  otherwise exceed its byte budget, even if fewer than 100 turns were included.
- Keep timeline activity data compact and bounded. For an unusually dense turn,
  deterministically bucket excess points and mark the summary as bucketed rather
  than breaching the response budget.
- Test the byte ceiling with both the measured session and synthetic long and
  event-dense sessions.

## Revision and snapshot consistency

For v1, `revision` is the selected row's `ingested_at`, serialized without losing
sub-millisecond precision. It changes whenever an ingestion replaces the stored
content. A content hash can replace it later if no-op re-uploads create material
cache churn.

`claude_sessions` uses `ReplacingMergeTree(ingested_at)`, so multiple physical
versions may coexist until background merges settle. The server must select the
revision, `content`, and `subagents` from the same logical row in one latest-state
query. Acceptable implementations include a single `argMax` over a tuple such as
`argMax(tuple(content, subagents, ingested_at), ingested_at)` or an equivalent
correct `FINAL` query. Independent `argMax` expressions and a later join that is
not constrained to the same `ingested_at` are not sufficient.

Each body request must read a consistent latest tuple and compare its revision
with the requested revision before returning content. On mismatch, return a
typed `STALE_REVISION` response, mapped to HTTP 409 where applicable. The client
then invalidates body queries and refetches the overview. The server must never
label content from revision B as revision A, and the API does not promise that a
superseded raw revision remains queryable after replacement and merging.

## Proposed procedures

### `analytics.sessions.detailOverview`

Input:

```ts
{
  sessionId: string
  turnCursor?: string
  turnLimit?: number // default 100, maximum 100
}
```

Output:

```ts
{
  revision: string
  session: {
    sessionId: string
    userId: string
    sessionDate: string
    lastInteractionDate: string
    projectPath: string
    repository: string | null
    gitBranch: string | null
    gitSha: string | null
    modelUsed: string | null
    source: string | null
    durationMinutes: number | null
    inputTokens: number
    outputTokens: number
    totalTokens: number
    totalInteractions: number | null
    estimatedCost: number | null
    skills: readonly string[]
    slashCommands: readonly string[]
  }
  turnPage: {
    items: readonly {
      turnId: string
      index: number
      startedAt: string | null
      endedAt: string | null
      durationSeconds: number | null
      userPreview: string | null
      responsePreview: string | null
      slashCommands: readonly string[]
      toolCallCount: number
      editedFiles: readonly string[]
      errorCount: number
      errorEvents: readonly { at: string }[]
      inputTokens: number | null
      outputTokens: number | null
      estimatedCost: number | null
      skills: readonly string[]
      skillEvents: readonly { at: string; skill: string }[]
      usageCalls: readonly {
        at: string
        model: string | null
        contextWindow: number | null
        freshInputTokens: number
        cacheReadInputTokens: number
        cacheCreationInputTokens: number
        outputTokens: number
      }[]
      activityResolution: "exact" | "bucketed"
      hasBody: boolean
    }[]
    nextCursor: string | null
    total: number
  }
  subagents: readonly {
    subagentId: string
    model: string | null
    totalTokens: number | null
    estimatedCost: number | null
    hasTranscript: boolean
  }[]
}
```

The cursor must encode or be server-bound to `revision` and the stable turn
position. A cursor from a superseded revision returns `STALE_REVISION`; it must
not paginate into a different transcript version.

Turn IDs must be stable for a given revision and must not depend on array
position alone. Preview truncation happens on the server before serialization.

The compact activity fields are deliberate. The current timeline plots usage,
error, and skill activity within turns and distinguishes gaps; timestamps plus
the usage components above preserve that behavior without sending the turn
body. `activityResolution: "bucketed"` is the documented degradation for an
exceptionally dense turn. Across bucketed usage calls, every token component
must sum to the turn's true input/output totals; bucketing may reduce temporal
resolution, never token magnitude. Normal sessions, including the measured
session, must remain `exact` for the web parity check.

### `analytics.sessions.detailTurn`

Input:

```ts
{
  sessionId: string
  revision: string
  turnId: string
}
```

Output:

```ts
{
  revision: string
  turnId: string
  userItems: readonly TraceItem[]
  responseItems: readonly TraceItem[]
}
```

`TraceItem` is a contract-validated discriminated union, not unbounded JSON. The
launch implementation may derive it from raw JSONL at request time, subject to
the cache and performance gates below. The intended steady state is ingest-time
materialization so selecting a turn never requires fetching and parsing the
entire transcript.

### `analytics.sessions.detailSubagent`

Input:

```ts
{
  sessionId: string
  revision: string
  subagentId: string
}
```

Output:

```ts
{
  revision: string
  subagentId: string
  content: string
}
```

The first iteration may return the subagent's raw JSONL string because lazy
loading removes the measured 13.4 MB from first paint. This defers, rather than
solves, main-thread parsing for a large individual subagent; measure it and move
normalization or parsing off the browser main thread in a follow-up. Normalized
subagent trace items are not part of the first contract.

All three procedures must reuse the existing uploader-user and session-owner
authorization checks. In the current ClickHouse schema, `organization_id`
contains the uploader's user ID rather than a true organization ID, so that
existing semantic must be preserved deliberately. A body endpoint must perform
its own ownership check and must not trust ownership implied by a previous
overview response.

## Cost parity gate

The ledger's per-turn Cost column is derived today from usage events inside the
turn bodies. Once the table renders from `detailOverview`, those events are no
longer available to the client pricing path. Therefore server-side per-turn and
session cost parity is a prerequisite for the web cutover, not a parallel or
optional pricing track.

Promote the existing request-level calculator used by the session detail view
into a server-safe shared module. Preserve its current turn attribution: a
subagent's edited files attribute to its parent turn, while subagent usage,
errors, and cost do not join any parent turn and instead contribute separately
to the session total. Preserve model selection, fresh-input tokens, cache-read
tokens, cache-creation tiers, output tokens, timestamp-sensitive rate
selection, and long-context rate-band selection driven by each request's full
input context. Use golden fixtures to prove that overview turn costs, session
totals, and the legacy client calculation agree.

`estimatedCost` may be `null` only when the existing request-level calculator
also cannot price the same usage data. The new API must not use the stored
session-level estimate as a substitute and must not introduce a third pricing
implementation.

Contract schemas and ownership tests do not need to wait for this extraction.
Implementing the overview metrics and switching the web route do.

## Launch server derivation and cache

The data is not stored by turn today. The main transcript is one `content`
`String`, and subagent transcripts are stored together in a `Map(String,
String)`. On a cache miss, request-time `detailOverview` must fetch and parse the
full raw row to derive turn boundaries, previews, activity, pricing inputs, and
body indexes. Without a server cache, a `detailTurn` click would repeat that
4.8 MB fetch and parse.

Request-time extraction is acceptable for launch only with a named
`sessionDetailDerivationCache` that has all of the following properties:

- Per-process, byte-size-capped LRU storage with a configurable cap and a
  maximum-entry guard so one pathological session cannot consume the process.
- Keys include the uploader/owner identity, source, `sessionId`, and `revision`;
  the effective content key remains `(sessionId, revision)` without permitting
  cross-owner cache reuse.
- The cached value contains the derived overview, stable turn-body indexes, and
  access to the matching raw subagent map, so body requests reuse the same
  parse.
- Concurrent misses for one key are coalesced into one in-flight derivation.
- Eviction is bounded by bytes and recency, not by an unbounded session count.
- Cache hits still perform request authorization before returning data.

This cache is local to each API process. Fly machines warm independently, and no
cross-machine hit rate or consistency is assumed. The revision check remains
mandatory even on cache hits.

Instrument raw bytes read, derivation duration, heap growth, hit/miss rate,
coalesced requests, and eviction count. Record p50, p95, and p99 for overview and
body requests on representative sessions. The rollout requires a measured and
agreed p95; merely observing that the path is cached is not sufficient.

## Target: ingest-time materialization

The process-local cache is a launch bridge, not the steady-state storage model.
Ingest-time materialization is the immediate follow-up and is expected to be the
largest implementation workstream. It requires a chkit schema change, ingestion
changes, generated types, and a production-safe backfill—not just a new API
handler.

Before creating tables, document the endpoint query patterns and choose an
`ORDER BY` that supports uploader/source/session/revision lookups and stable turn
selection. ClickHouse primary/order keys are effectively immutable; do not copy
the existing session key mechanically. Because transcript parsing and pricing
already live in TypeScript, the initial design should evaluate direct batched
ingest into typed turn-summary and turn-body tables before choosing an
incremental materialized view. If an incremental MV is chosen, it handles new
inserts only and still needs a separate historical backfill.

The migration and backfill plan must explicitly account for repository-specific
chkit and ClickHouse hazards:

- Review and, when necessary, reorder generated operations so databases, tables,
  and materialized views are created in dependency order.
- Keep MV target column order exact and use explicit insert column lists so
  position-based writes cannot silently corrupt fields.
- Run migration commands with `bun --bun`, use `CLICKHOUSE_DB=default` where
  required, and regenerate checked-in ClickHouse types after schema changes.
- Backfill from a different source table than the target, force
  `async_insert=0`, batch writes, and verify source/target counts plus sampled
  content and cost checksums. A successful HTTP status alone is not proof that
  rows were inserted.
- Preserve uploader/owner filters in every read and in cache/materialization
  keys.

Do not remove the request-time path until the materialized path has been
backfilled, parity-tested, observed in production, and given an explicit rollback
window.

## Client loading and failure states

- Overview pending: keep the existing full detail skeleton.
- Overview failure or timeout: keep the route shell mounted and show the
  retryable error card.
- Additional turn page pending: retain loaded rows and show an inline loading
  state at the end of the table.
- Additional turn page failure: retain loaded rows and offer an inline retry.
- Turn pending: keep the overview table interactive and show a skeleton only in
  the selected response pane.
- Turn failure: show a retry action inside that response pane; do not unmount the
  route or table.
- Stale revision: invalidate body and overview queries, refetch the overview,
  and preserve the selection only if its turn ID still exists.
- Subagent pending: show an inline expansion skeleton.
- Subagent failure: keep the parent turn visible and show an inline retry action.
- Selection changes: cancel obsolete in-flight turn requests.
- Full-transcript escape hatch: a user-invoked **Load full transcript** action
  fetches all remaining turn bodies on demand with bounded concurrency, visible
  progress, cancellation, and per-turn retry. Once complete, the literal main
  transcript is rendered so browser Cmd+F retains today's behavior. This action
  must not eagerly load subagent transcripts or change the initial payload.
- Contract drift: validate every response at its query boundary, retain safe
  fields where possible, and log field names without logging transcript content.

## Browser caching

- Overview page query key: `sessionId`, `revision` when known, and `turnCursor`.
- Turn query key: `sessionId`, `revision`, and `turnId`.
- Subagent query key: `sessionId`, `revision`, and `subagentId`.
- Give the first overview page a short stale window, initially 60 seconds.
- Treat revision-keyed pages, turns, and subagent bodies as immutable and stale
  only when the first overview page returns a new revision.
- Retain body queries for a bounded period, initially 10 minutes, rather than
  accumulating every transcript opened during a long browsing session.
- Do not prefetch all turns or subagents. At most, prefetch an adjacent turn
  after the selected turn settles and only when the browser is idle.

## Transport compression

Turn and subagent body responses must use gzip when the request advertises gzip
support and the payload exceeds the configured compression threshold. Responses
must include correct `Content-Encoding` and `Vary: Accept-Encoding` headers.
Integration tests must assert both headers and transferred-byte reduction on a
representative large body.

The API application currently has no explicit compression middleware in its
request path. Fly or another edge layer may compress responses, but that behavior
must be verified rather than assumed. The contract may be satisfied at the API
or edge layer as long as it is observable and tested end to end.

## Rollout sequence

1. Add contract schemas, typed `STALE_REVISION` errors, and uploader/session-owner
   tests for all three procedures. This step is approved immediately and has no
   schema-migration dependency.
2. Promote the existing request-level cost calculator to a server-safe shared
   implementation and add golden per-turn/session parity fixtures. This blocks
   overview metric implementation and the web cutover.
3. Implement `detailOverview` with a same-query revision/content snapshot, the
   bounded derivation cache, preview limits, activity summaries, pagination, and
   serialized-byte tests.
4. Implement turn and subagent body procedures with independent authorization,
   revision checks, cache reuse, gzip verification, and explicit failure states.
5. Switch the web route behind a rollout guard. Compare turn rows, per-turn and
   session costs, token/tool/file/error/skill metrics, timeline activity, and
   selected content against the legacy response. The measured session's timeline
   must be exact; explicitly review any bucketed long-session case.
6. Remove the guard only after the initial payload is at or below 250 KB for the
   measured session and representative long/event-dense sessions, and after the
   request-time path meets the agreed p95 and memory/cache bounds.
7. Begin the ingest-time materialization migration and backfill as the immediate
   follow-up, using the launch path as a rollback until production parity holds.
8. Remove `analytics.sessions.detail` only after no supported client consumes it
   and the replacement has completed its rollback window.

## Acceptance criteria

- The measured session's initial payload is approximately 100–200 KB, and every
  initial overview response is at or below the 250 KB uncompressed ceiling.
- Long sessions paginate with stable revision-bound cursors; previews are at most
  140 Unicode code points.
- Initial payloads contain no main or subagent transcript strings.
- First paint renders metadata and the first page of turn rows without fetching
  a body; later rows load without replacing already-rendered rows.
- For normal-sized sessions, **Load full transcript** fetches and renders all
  remaining main turn bodies so browser Cmd+F can search the literal transcript.
- The current ledger and timeline remain functionally equivalent for ordinary
  sessions. Any activity bucketing for pathological turns is explicit in the
  response and UI review, and its token-component sums equal the true turn
  totals.
- Server per-turn and session costs match the existing request-level calculation;
  nullable values match the same unpriceable cases.
- Expanding one subagent fetches only that subagent over the browser transport.
- Body responses are compressed in an end-to-end test.
- A failed or stale turn/subagent request cannot blank the route or mix revisions.
- Every new response is runtime-validated at the client boundary.
- Authorization behavior matches the legacy detail procedure and preserves the
  current uploader-ID semantics of `organization_id`.
- The request-time launch path has a byte-bounded cache and meets an agreed p95;
  each Fly machine is assumed to warm independently.
- No new cost calculation is introduced.

## Resolved decisions and deferred work

- `revision`: use `ingested_at` for v1; consider a content hash only if no-op
  re-ingestion causes meaningful churn.
- Launch derivation: request-time extraction is allowed only with the named
  per-process cache, memory bounds, and measured p95.
- Target derivation: ingest-time materialization is the immediate follow-up and
  requires a separately reviewed chkit migration and backfill plan.
- Subagents: raw JSONL is allowed in the first lazy body contract. Normalized
  trace items or a browser worker are follow-up work.
- Timeline: preserve exact current activity for ordinary sessions; bounded,
  explicitly marked bucketing is allowed only for event-dense turns needed to
  protect the payload ceiling.

## ClickHouse design basis

The consistency and migration constraints above follow the repository's
ClickHouse architecture and operational rules:

- ReplacingMergeTree queries need explicit latest-state semantics; background
  merges alone do not guarantee one visible version.
- `SELECT ... FINAL` or a correct same-row `argMax` is acceptable here;
  `OPTIMIZE TABLE ... FINAL` is not part of the request path.
- Incremental materialized views do not backfill existing data automatically.
- Table order keys should be chosen from documented query patterns before table
  creation because changing them later requires a new table and migration.
- Backfill inserts must be batched and verified as data operations, not inferred
  from successful migration or HTTP status alone.
