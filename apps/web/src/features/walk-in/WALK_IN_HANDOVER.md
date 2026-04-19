# Walk-In Handover

## Source Of Truth

- Browser preview route: `apps/web/src/features/walk-in/RudelWalkInPage.tsx`
- Typed contract: `apps/web/src/features/walk-in/lib/walk-in-handover-schema.ts`
- Seed payload: `apps/web/src/features/walk-in/data/walk-in-handover-data.ts`
- Storyboard: `apps/web/src/features/walk-in/WRAPPED_STORYBOARD.md`
- Static portrait asset: `apps/web/public/walk-in-profile.png`
- Public route interception: `apps/web/src/App.tsx`

The current page should keep reading from `walkInHandoverData.preview` until real metrics exist. When production data is ready, replace the mock payload through an adapter instead of rewriting the page around raw query results.

## Story Principle

The wrapped experience should behave like a story, not a dashboard. The sequence should move through:

- identity
- history
- habit
- allegiance
- confession
- flex
- share

`WRAPPED_STORYBOARD.md` is the current source of truth for that sequence. Any future render or motion work should treat that storyboard as the narrative layer and the wrapped adapter as the data layer.

## V1 Metric Scope

The goal for v1 is not to ship every wishlist metric. The goal is to ship only metrics that are unambiguous, reproducible, and defensible from the current analytics model.

### Included for v1

- Days since first session
- Total sessions
- Active days
- Favorite model
- Total tokens
- Estimated spend
- Longest session
- Claude vs Codex split

These are the metrics the current ClickHouse session analytics model can support with high confidence today.

### Intentionally left out for now

- Favorite time
- Favorite day, unless UTC semantics are explicitly accepted
- Favorite word
- Apology count
- Swear word count
- Skills used across both sources
- Message count across both sources
- Context window %

These are deferred on purpose, not forgotten. They are currently excluded because at least one of the following is still unresolved:

- source semantics do not match between Claude and Codex
- the metric depends on local timezone data that is not currently stored
- the metric requires text parsing or moderation rules that are not yet stabilized
- the metric needs a clearer product definition before implementation

## Ownership Split

- Design owner: evolves layout, motion, and visual language inside the existing preview schema.
- Data owner: computes real values for the selected metrics and emits the same shape as the handover schema.
- Render owner: converts the approved story beats and targets in `renderPlan` into a deterministic export pipeline.

The intended split is `query data -> map into schema -> preview/render consume schema`. That keeps UI changes and analytics changes decoupled.

## Render Notes

- Current route is a browser preview, not a final export surface.
- `renderPlan.strategy` is set to `remotion-compatible` so the eventual renderer can recreate the same scenes as a real `1080x1920` share image or video.
- Current targets are:
  - `web-preview`: `495x880`
  - `share-card`: `1080x1920`
  - `story-video`: `1080x1920 @ 30fps`

If the render owner needs a different internal composition model, keep the adapter at the boundary and preserve the external handover contract. The page should not become aware of database tables or render infrastructure details.

## 10/10 Plan

The current state is good enough for a focused v1, but it is not yet a `10/10` production handoff. A `10/10` here means every displayed metric has a frozen definition, a deterministic implementation, and fixture-backed verification.

### Step 1: Freeze the v1 metric contract

Owner: product + data

For each included v1 metric, write down:

- exact label shown to the user
- source table or derived field
- formula or aggregation rule
- scope
  - active organization only
  - specific date range
  - provider-specific or cross-provider
- fallback behavior when data is missing
- whether the UI must say `estimated`

Deliverable: a stable metric spec that the backend adapter and the renderer both target.

### Step 2: Add a dedicated wrapped data adapter

Owner: backend/data

Create a production function or endpoint that returns `WalkInHandover` from real analytics data. The page should consume:

- `buildWalkInHandover(realAnalyticsPayload)`

instead of:

- `walkInHandoverData`

The adapter should be the only layer that knows how to translate database fields into wrapped metrics.

Deliverable: one typed backend boundary for wrapped data.

### Step 3: Keep v1 metrics on top of existing safe fields

Owner: backend/data

Implement the adapter using the current ClickHouse `session_analytics` model for the included v1 metrics only. Do not pull deferred metrics into the first production pass.

Deliverable: a production payload that stays inside the current confidence envelope.

### Step 4: Add golden fixtures for wrapped output

Owner: backend/data

Create a small fixture set covering Claude sessions, Codex sessions, and a mixed user. Assert the final wrapped payload for each fixture, not just intermediate SQL rows.

Deliverable: snapshot-style confidence that the wrapped adapter is stable.

### Step 5: Add data-quality checks

Owner: backend/data

Track the health of the inputs that feed wrapped metrics. At minimum:

- percent of sessions with `unknown` model
- percent of sessions missing repo identity
- percent of sessions with zero tokens
- percent of sessions that fail source classification

Deliverable: visibility into whether the wrapped story is trustworthy before export.

### Step 6: Expand to deferred metrics only after normalization

Owner: product + data

Do not add the deferred metrics until the missing prerequisites are solved:

- timezone capture for local-time metrics
- cross-source normalization for message and feature semantics
- text-analysis rules for favorite word, apology count, and swear-word count

Deliverable: a clean phase 2 expansion path without weakening v1 confidence.

## Immediate Next Step

Freeze the exact v1 metric list above and implement the dedicated wrapped adapter around those metrics only. That is the shortest path from `7/10` to `10/10` without changing the visual design or rebuilding the data model first.

That keeps the handoff smooth, avoids scope creep, and gives the render owner a contract they can trust.
