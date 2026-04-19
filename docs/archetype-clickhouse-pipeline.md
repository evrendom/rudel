# Archetype Pipeline for Wrapped

This document is the implementation plan for keeping a `Claude Code / Codex` archetype up to date for every wrapped user.

It is written for the backend team, not for design. The goal is:

- correct archetypes after every session upload
- no `FINAL` in product read paths
- no hidden double counting from retries or cross-org uploads
- versioned snapshots so Wrapped can be frozen for a campaign

## Active Taxonomy

The active product taxonomy is documented in:

- [archetype-taxonomy.md](/Users/evrendombak/conductor/workspaces/rudel/geneva/docs/archetype-taxonomy.md)

The current label family is:

- Roadrunner
- Window Shopper
- NPC
- Papa's Credit Card
- Hit and Runner
- ADHD Brain
- Needs to Touch Grass
- Tourist
- Maniac

Older theoretical labels are retired and should not be used in product or pipeline work.

## Executive Summary

Use the existing `rudel.session_analytics` table as the source of truth for session-level metrics, but do **not** compute archetypes directly from it at request time.

Instead:

1. Deduplicate session facts by the natural key `(source, organization_id, user_id, session_id)` using `argMax(..., ingested_at)`.
2. Rebuild a versioned global archetype snapshot after each upload.
3. Read Wrapped archetypes only from the latest successful snapshot.
4. Freeze a specific snapshot id for a Wrapped campaign.

At the current production size, a full rebuild is cheap enough to prefer correctness and simplicity over streaming complexity.

## What Exists Today

Observed in production on April 19, 2026:

- ClickHouse version: `25.12.1.1`
- Raw tables:
  - `rudel.claude_sessions` -> `SharedMergeTree`
  - `rudel.codex_sessions` -> `SharedReplacingMergeTree(ingested_at)` with 365-day TTL
- Derived table:
  - `rudel.session_analytics` -> `SharedReplacingMergeTree(ingested_at)`
- Dependent materialized views:
  - `rudel.session_analytics_mv`
  - `rudel.codex_session_analytics_mv`
- Insert path:
  - `apps/api/src/clickhouse.ts` uses synchronous inserts with `async_insert=0`
  - current server setting also shows `async_insert=0`

Relevant code paths:

- `apps/api/src/clickhouse.ts`
- `apps/api/src/router.ts`
- `apps/api/src/services/wrapped.service.ts`
- `packages/ch-schema/src/db/schema/session-analytics.ts`
- `packages/ch-schema/src/db/schema/codex-sessions.ts`

## Current Risks in the Existing Setup

### 1. Wrapped currently reads from a duplicated table shape

`apps/api/src/services/wrapped.service.ts` queries `rudel.session_analytics` directly and does not use `FINAL` or `argMax`.

Observed in prod:

- raw `session_analytics` rows: `6037`
- deduped `(source, session_id)` rows: `5657`
- raw total tokens: `1,580,545,849`
- deduped total tokens: `1,062,910,169`

That is large enough to materially distort Wrapped metrics.

### 2. `session_id` alone is not a safe dedupe key

For Codex in particular, the same `session_id` appears under multiple orgs and even multiple users.

That means:

- deduping by `session_id` alone will silently move sessions between org scopes
- deduping by `(source, session_id)` alone is also unsafe for org-scoped Wrapped

For Wrapped, the correct session identity is:

`(source, organization_id, user_id, session_id)`

### 3. Incremental materialized views are the wrong primitive for archetype assignment

ClickHouse documents incremental materialized views as insert triggers that operate only on newly inserted blocks, not on the full source table. That is exactly why they work well for session-level derivations and poorly for global percentile ranking.

Why this matters here:

- archetype normalization depends on the whole user population
- one new upload can change the percentile position of many users
- an incremental MV cannot safely update previously assigned users based on other users' new uploads

This is the key reason to avoid "one more MV" for archetypes.

### 4. ReplacingMergeTree does not remove duplicates immediately

ClickHouse documents `ReplacingMergeTree` deduplication as asynchronous. Correct query-time results require `FINAL` or an explicit `argMax` pattern.

That makes `session_analytics` a fine intermediate store, but a bad direct source for Wrapped reads.

### 5. Current ClickHouse version is before the async-insert-plus-MV dedupe fix

ClickHouse 26.1 added reliable deduplication for asynchronous inserts with dependent materialized views.

Production is `25.12.1.1`, so the current decision to keep `async_insert=0` is correct for this pipeline. Do not switch this archetype flow to async inserts until the cluster is upgraded and the end-to-end behavior is verified.

### 6. There is prod/schema drift already

Local schema definitions and production are not identical today. Example:

- local `claude_sessions` definition expects `SharedReplacingMergeTree(ingested_at)` plus TTL
- prod `claude_sessions` is still `SharedMergeTree`

Do not design the archetype system assuming raw-table dedupe or TTL behavior that only exists in source control.

## Why the Recommended V1 Is a Full Snapshot Rebuild

The canonical per-user feature rollup currently runs in about `250-300ms` over all production data.

That makes the best v1:

- rebuild the entire archetype snapshot after each upload
- keep the rebuild asynchronous so uploads stay fast
- read only from the latest successful snapshot

This wins because it is:

- exact
- easy to reason about
- easy to backfill
- easy to freeze for a Wrapped campaign
- robust to the current duplicate patterns

Do not overengineer streaming percentile math at this stage.

## Recommended Data Model

### Table 1: centroid definitions

`rudel.wrapped_archetype_centroids_v1`

Purpose:

- stores the currently active empirical archetype centers
- makes centroid versioning explicit
- avoids burying classification constants in application code

Use one row per archetype per centroid version.

### Table 2: immutable archetype snapshots

`rudel.wrapped_user_archetype_snapshots_v1`

Purpose:

- stores one full snapshot row per `(snapshot_id, organization_id, user_id)`
- contains both raw features and final assigned archetype
- becomes the only read path for Wrapped archetype data

Important shape:

- append-only
- no updates
- no `ReplacingMergeTree`
- reads are filtered by `snapshot_id`

### Table 3: snapshot run log

`rudel.wrapped_user_archetype_runs_v1`

Purpose:

- publishes which snapshot is valid
- gives one place to monitor recalc health
- allows campaign pinning

Important behavior:

- insert a run row only after the snapshot insert succeeds
- product readers use the latest successful run row

## Snapshot Identity and Campaign Freezing

There are two distinct product needs:

### Live archetype

Used for:

- profile surfaces
- "your current archetype" UI
- internal analytics

Behavior:

- always points to the latest successful snapshot

### Wrapped campaign archetype

Used for:

- a specific Wrapped launch
- a narrative that should not drift every time someone uploads again

Behavior:

- pin a specific `snapshot_id`
- keep using it for the full campaign

Recommendation:

- store the pinned campaign snapshot id outside ClickHouse in your app config or SQL database
- do not infer the campaign snapshot from "latest"

## Exact Scope Rules

These rules should be implemented once and reused everywhere:

### User scope

Archetypes are org-scoped:

`(organization_id, user_id)`

This matches the existing Wrapped contract:

`scope = active_organization_all_time`

If you later want a cross-org personal archetype, build a second pipeline with a different scope key. Do not mix the two.

### Session dedupe key

Deduplicate session facts by:

`(source, organization_id, user_id, session_id)`

For every derived session field, keep the latest version by:

`argMax(field, ingested_at)`

### Repo identity for breadth

Use:

`if(git_remote != '', git_remote, nullIf(package_name, ''))`

Do **not** fall back to `project_path`.

If no repo identity exists:

- set `breadth_raw = NULL`
- set `breadth_available = 0`
- exclude breadth from the archetype distance calculation

## Feature Definitions

These should stay aligned with the current empirical archetype work.

Raw features per org-scoped user:

- `consistency_raw = active_days / days_since_first_session`
- `intensity_raw = total_sessions / active_days`
- `session_shape_raw = longest_session_min / mean_session_min`
- `cost_intensity_raw = estimated_spend_usd / total_sessions`
- `output_raw = commit_sessions / total_sessions`
- `breadth_raw = distinct_repos / sqrt(active_days)` when repo identity exists, otherwise `NULL`
- `range_raw = Shannon entropy of model usage`

Normalization:

- use global percent rank across all `(organization_id, user_id)` rows in the rebuild
- compute breadth rank only across rows where `breadth_raw IS NOT NULL`

Distance:

- compute Euclidean distance against the active centroid version
- if breadth is missing, skip that dimension in the distance sum
- store both:
  - `archetype_distance`
  - `archetype_distance_ratio_to_max = archetype_distance / sqrt(used_dimensions)`

The ratio is useful because users missing breadth have a smaller maximum possible distance.

## Rebuild Flow

### Trigger

After a successful upload insert returns:

1. enqueue a `rebuild_live_archetype_snapshot` job
2. do not block the upload response on the rebuild

### Coalescing

Do not run one rebuild per upload blindly.

Recommended worker behavior:

- allow at most one rebuild at a time
- if uploads arrive while a rebuild is running, mark the pipeline dirty
- immediately run one more rebuild when the current one finishes

This gives near-real-time updates without a queue explosion.

### Query shape

The rebuild job should:

1. generate a new `snapshot_id`
2. run one `INSERT INTO ... SELECT ...` that builds the full snapshot
3. insert one success row into `wrapped_user_archetype_runs_v1`

If step 2 fails, do not publish the snapshot id.

## Product Read Path

Wrapped should not query `rudel.session_analytics` to compute archetypes live.

Instead:

1. fetch the current `snapshot_id` from `wrapped_user_archetype_runs_v1`
2. read the user's row from `wrapped_user_archetype_snapshots_v1`

This avoids:

- `FINAL`
- ad hoc `argMax`
- inconsistent reads during background merges

## Rollout Plan

### Phase 1: create tables

Create:

- `wrapped_archetype_centroids_v1`
- `wrapped_user_archetype_snapshots_v1`
- `wrapped_user_archetype_runs_v1`

Seed the centroid table with the current empirical `k=9` centers for the active taxonomy above.

### Phase 2: backfill the first snapshot

Run the rebuild query once manually.

Validate:

- row count equals current distinct `(organization_id, user_id)` count
- Numia users resolve to the expected archetypes from the current active taxonomy outputs
- no product query uses raw `session_analytics` for archetype reads

### Phase 3: wire the upload trigger

After `ingestSession` succeeds, enqueue the rebuild job.

### Phase 4: switch Wrapped reads

Update the Wrapped service to source:

- archetype label
- archetype distance
- feature dimensions

from the snapshot table.

### Phase 5: freeze the campaign snapshot

When you are ready to ship the Wrapped experience, pin a snapshot id and stop reading "latest" for that campaign.

## Monitoring

Track at least these:

- latest successful snapshot age
- rebuild duration
- rebuild row count
- duplicate scope sessions in `session_analytics`
- drift between raw row counts and deduped scope-session counts

Useful checks:

- `count() - uniqExact(tuple(source, organization_id, user_id, session_id))` from `rudel.session_analytics`
- latest row in `wrapped_user_archetype_runs_v1`
- count of rows for the latest `snapshot_id`

## Things the Backend Team Should Not Do

- Do not compute archetypes with a new incremental MV on the raw session tables.
- Do not dedupe by `session_id` alone.
- Do not use `project_path` in breadth.
- Do not rely on `ReplacingMergeTree` merges for product correctness.
- Do not use `FINAL` in Wrapped request paths as the steady-state design.
- Do not turn on async inserts for this pipeline before a ClickHouse upgrade past the 26.1 materialized-view dedupe fix and a dedicated verification pass.
- Do not hardcode centroid values in multiple places. Keep one versioned centroid table.

## When to Revisit This Design

This v1 should be revisited when one of these becomes true:

- full rebuild exceeds about `2s` p95
- upload rate is high enough that rebuild coalescing is constantly dirty
- `session_analytics` grows into the high millions of rows
- you want both org-scoped and global-personal archetypes

At that point, move to:

- a canonical deduped session-state table
- periodic normalization snapshots
- possibly separate live and campaign pipelines

But that is not the best launch design today.
