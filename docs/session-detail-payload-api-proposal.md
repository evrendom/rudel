# Session Detail Payload API Proposal

Status: proposal only. This document does not authorize or implement an API
contract change.

## Decision summary

Replace the session detail screen's single eager payload with an additive,
three-part API:

1. Load session metadata, turn summaries, and subagent summaries first.
2. Load one turn body when that turn is selected.
3. Load a subagent transcript only when that subagent is expanded.

Keep the existing `analytics.sessions.detail` procedure during migration. Add
the new procedures alongside it, move the web route to them behind a rollout
guard, then remove the legacy procedure after payload and behavior checks pass.

## Measured baseline and target

The measured detail response for the investigated session is 18.3 MB:

- Main transcript `content`: 4.8 MB
- Eager subagent transcripts: 13.4 MB
- All remaining metadata: approximately 100 KB
- Comparable 30-day session list response: 59 KB

The initial detail request should therefore be approximately 100–200 KB for
this session, with a hard acceptance ceiling of 250 KB. Neither the main
transcript body nor any subagent transcript body may appear in that response.

## Proposed procedures

### `analytics.sessions.detailOverview`

Input:

```ts
{
  sessionId: string
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
    skills: readonly string[]
    slashCommands: readonly string[]
  }
  turns: readonly {
    turnId: string
    index: number
    startedAt: string | null
    endedAt: string | null
    durationSeconds: number | null
    userPreview: string | null
    responsePreview: string | null
    toolCallCount: number
    errorCount: number
    inputTokens: number | null
    outputTokens: number | null
    estimatedCost: number | null
    hasBody: boolean
  }[]
  subagents: readonly {
    subagentId: string
    model: string | null
    totalTokens: number | null
    hasTranscript: boolean
  }[]
}
```

`revision` identifies the ingested content version. Turn and subagent requests
must include it so cached bodies cannot be combined with a newer overview.
Turn IDs must be stable for a given revision and must not depend on array
position alone.

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

`TraceItem` should be a contract-validated discriminated union, not unbounded
JSON. The API may derive it from raw JSONL at request time for the first
iteration, but the intended steady state is ingest-time derivation so selecting
a turn does not repeatedly parse the entire transcript.

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

The first iteration may return the subagent's JSONL string because lazy loading
already removes 13.4 MB from first paint. A later contract can return normalized
trace items without changing the overview procedure.

All three procedures must reuse the existing organization and session-owner
authorization checks. A body endpoint must not trust ownership implied by a
previous overview response.

## Client loading and failure states

- Overview pending: keep the existing full detail skeleton.
- Overview failure or timeout: keep the route shell mounted and show the
  retryable error card.
- Turn pending: keep the overview table interactive and show a skeleton only in
  the selected response pane.
- Turn failure: show a retry action inside that response pane; do not unmount the
  route or table.
- Subagent pending: show an inline expansion skeleton.
- Subagent failure: keep the parent turn visible and show an inline retry action.
- Selection changes: cancel obsolete in-flight turn requests.
- Contract drift: validate every response at its query boundary, retain safe
  fields where possible, and log field names without logging transcript content.

## Caching

- Overview query key: `sessionId`.
- Turn query key: `sessionId`, `revision`, and `turnId`.
- Subagent query key: `sessionId`, `revision`, and `subagentId`.
- Give the overview a short stale window, initially 60 seconds.
- Treat revision-keyed turn and subagent bodies as immutable and stale only when
  the overview returns a new revision.
- Retain body queries for a bounded period, initially 10 minutes, rather than
  accumulating every transcript opened during a long browsing session.
- Do not prefetch all turns or subagents. At most, prefetch an adjacent turn
  after the selected turn settles and only when the browser is idle.

## Server derivation

The overview cannot depend on downloading the raw content into the browser to
discover turns. Turn boundaries, previews, timings, and summary metrics must be
derived server-side. Request-time derivation is acceptable for the migration,
provided it is measured and cached; ingest-time materialization is the target.

Cost fields remain nullable until the canonical cost-calculation decision is
implemented. This proposal must not create a third pricing implementation.

## Rollout sequence

1. Add contract schemas and ownership tests for the three procedures.
2. Implement `detailOverview` and record response byte size in integration tests
   or request instrumentation.
3. Implement turn and subagent body procedures with revision checks.
4. Switch the web route behind a rollout guard and compare displayed turn counts,
   metrics, and selected content against the legacy response.
5. Remove the guard after the initial payload remains below 250 KB for the
   measured session and representative large sessions.
6. Remove `analytics.sessions.detail` only after no supported client consumes it.

## Acceptance criteria

- Initial payload is 100–200 KB for the measured session and never exceeds the
  250 KB ceiling.
- Initial payload contains no main or subagent transcript strings.
- First paint can render metadata and all turn rows without fetching a body.
- Expanding one subagent fetches only that subagent.
- A failed turn or subagent request cannot blank the route.
- Every new response is runtime-validated at the client boundary.
- Authorization behavior matches the legacy detail procedure.
- No new cost calculation is introduced.

## Open decisions for review

- Exact source of `revision` (`ingested_at`, a content hash, or a dedicated
  immutable identifier).
- Whether request-time turn extraction is acceptable for the first rollout or
  ingest-time materialization is required before launch.
- Whether normalized subagent trace items belong in the first contract or a
  follow-up after lazy loading ships.
