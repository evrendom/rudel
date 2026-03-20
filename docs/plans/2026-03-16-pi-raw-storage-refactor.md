# Plan: Pi Raw Storage + Materialized Views

## Context

PR #155 feedback from KeKs0r: instead of transforming Pi sessions to Claude Code format during ingestion, we should:
1. Store Pi sessions **raw** in their own table (preserving the native format)
2. Add a `version` column to distinguish v2 vs v3
3. Create **two MVs** that extract analytics from each version separately

This follows the pattern established by `codex_sessions` — own table, own MV into shared `session_analytics`.

## Current State (PR #155)

- Pi adapter maps to `source: "claude_code"` and ingests into `rudel.claude_sessions`
- v3 content is transformed at ingestion time (`transformV3Content()`) to Claude Code JSONL format
- v2 subagent content is concatenated and stored as-is (already Claude Code format)
- `registerScanOnlyAdapter()` exists to share source key without registry collision

## Target State

- New `rudel.pi_sessions` table (base columns + `version` UInt8 + `subagents` Map)
- `source: "pi"` added to `SourceSchema`
- Pi adapter ingests **raw** content — no `transformV3Content()` at ingest time
- Two MVs:
  - `pi_v2_session_analytics_mv`: parses v2 content (Claude Code format subagent JSONL) → mirrors `session_analytics_mv`
  - `pi_v3_session_analytics_mv`: parses v3 content (native Pi JSONL format) → extracts timestamps/tokens/metrics directly
- Both MVs write to the shared `rudel.session_analytics` table with `source = 'pi'`

## Approach

The changes span 3 layers: schema, API routing, CLI adapter.

---

## Task 1: Add `"pi"` to SourceSchema

**File:** `packages/api-routes/src/schemas/source.ts` (modify)
**Purpose:** Allow `source: "pi"` in the API contract

### Steps

1. Add `"pi"` to the `SourceSchema` enum:
   ```typescript
   export const SourceSchema = z.enum(["claude_code", "codex", "pi"]);
   ```

2. Verify: `bun run --cwd packages/api-routes build` (or typecheck) passes

---

## Task 2: Create `pi-sessions.ts` schema with table + 2 MVs

**File:** `packages/ch-schema/src/db/schema/pi-sessions.ts` (create)
**Purpose:** Define `rudel.pi_sessions` table and both analytics MVs

### Steps

1. Create the table definition:
   - Extend `baseSessionColumns` + `baseSessionTableConfig`
   - Add `version` column: `UInt8`, default `0`
   - Add `subagents` column: `Map(String, String)`, default `fn:map()`
   - Engine: `SharedReplacingMergeTree(ingested_at)`

2. Create `pi_v2_session_analytics_mv`:
   - Source: `rudel.pi_sessions` filtered by `WHERE version = 2`
   - Target: `rudel.session_analytics`
   - SQL: Copy the Claude Code MV logic from `session-analytics.ts` (it parses `type: "user"/"assistant"` JSONL with `message.usage` tokens)
   - **IMPORTANT:** Use `SELECT * EXCEPT (session_date, last_interaction_date, version)` — `version` exists on `pi_sessions` but NOT on `session_analytics`
   - Set `source = 'pi'`

3. Create `pi_v3_session_analytics_mv`:
   - Source: `rudel.pi_sessions` filtered by `WHERE version = 3`
   - Target: `rudel.session_analytics`
   - **IMPORTANT:** Use `SELECT * EXCEPT (session_date, last_interaction_date, version)` — same reason as v2
   - SQL: Parse native Pi v3 format directly. Key differences from Claude Code format:
     - Lines have `type = 'message'` (not `type = 'user'`/`'assistant'`)
     - Role is nested: `JSONExtractString(JSONExtractRaw(x, 'message'), 'role')`
     - Usage keys differ — need two-level extraction:
       ```sql
       -- Token extraction from v3 format: {type:"message", message:{usage:{input:N, output:N, cacheRead:N, cacheWrite:N}}}
       arraySum(arrayMap(x -> toUInt64OrZero(toString(JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'input'))), _assistant_lines)) AS _input_tokens,
       arraySum(arrayMap(x -> toUInt64OrZero(toString(JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'output'))), _assistant_lines)) AS _output_tokens,
       arraySum(arrayMap(x -> toUInt64OrZero(toString(JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'cacheRead'))), _assistant_lines)) AS _cache_read,
       arraySum(arrayMap(x -> toUInt64OrZero(toString(JSONExtractUInt64(JSONExtractRaw(x, 'message'), 'usage', 'cacheWrite'))), _assistant_lines)) AS _cache_creation,
       ```
     - Model is nested: `JSONExtractString(JSONExtractRaw(x, 'message'), 'model')`
     - Interaction filtering: `JSONExtractString(x, 'type') = 'message' AND JSONExtractString(JSONExtractRaw(x, 'message'), 'role') IN ('user', 'assistant')`
   - Set `source = 'pi'`

4. Export schema: `export default schema(rudel_pi_sessions, pi_v2_mv, pi_v3_mv);`

### Verification
- `bun run --cwd packages/ch-schema ch:generate:dryrun` shows expected DDL
- `bun run --cwd packages/ch-schema ch:codegen` regenerates types with `RudelPiSessionsRow`

### Edge Cases
- v2 content has subagent lines concatenated with `\n` — the Claude Code MV pattern already handles this
- v3 content has non-message types (`session`, `compaction`, `thinking_level_change`, `toolResult`) — MV must filter to only `type = 'message'` with role `user`/`assistant`
- ClickHouse MV ordering issue — may need to manually reorder migration SQL (tables before MVs)
- `version` column must be excluded from `SELECT *` in both MVs (not present in `session_analytics`)

---

## Task 3: Generate migration + codegen

**Purpose:** Create the SQL migration and update TypeScript types

### Steps

1. `bun run --cwd packages/ch-schema ch:generate` — creates migration file
2. Verify migration SQL has correct ordering (tables before MVs) — reorder if needed (known chkit bug)
3. `bun run --cwd packages/ch-schema ch:codegen` — regenerate types
4. Verify `RudelPiSessionsRow` type exists in `packages/ch-schema/src/generated/chkit-types.ts`
5. Verify `ingestRudelPiSessions` function exists in `packages/ch-schema/src/generated/chkit-ingest.ts`

---

## Task 4: Simplify Pi adapter — store raw, use own source

**File:** `packages/agent-adapters/src/adapters/pi/index.ts` (modify)
**Purpose:** Stop transforming content, ingest raw into `pi_sessions` with version column

### Steps

1. Change `source` from `"claude_code"` to `"pi"`
2. Change `rawTableName` from `"rudel.claude_sessions"` to `"rudel.pi_sessions"`
3. In `buildUploadRequest()`:
   - **v2**: Keep reading and concatenating subagent files, but store as raw (already Claude Code format — no change needed)
   - **v3**: Store raw content as-is (remove `transformV3Content()` call)
4. Remove `transformV3Content()` export (no longer needed at ingest time — MV handles it)
5. Update `ingest()` to use `ingestRudelPiSessions` instead of `ingestRudelClaudeSessions`
6. Add `version` field to the row builder:
   - v2 → `version: 2`
   - v3 → `version: 3`
   - Need to detect version — options:
     a. Check if content starts with `{"type":"session","version":3` → v3, else v2
     b. Pass version through from `buildUploadRequest` via a new field on `IngestSessionInput`

**Design decision:** Add an optional `version` field to `IngestSessionInput` schema. The adapter sets it during upload, the API passes it through to the row. This is cleaner than re-parsing content on the server.

### Edge Cases
- `extractTimestamps()` needs to work on BOTH raw v2 and raw v3 content
  - v2: lines have `timestamp` field on entries with `type: "user"/"assistant"`
  - v3: lines have `timestamp` field on entries with `type: "message"` (role user/assistant)
  - **Current code only matches `type: "user"` or `type: "assistant"`** — must also match `type: "message"` for raw v3
  - Simplest fix: extract `timestamp` from any line that has one, take min/max (no type filtering needed)

---

## Task 5: Update IngestSessionInput schema for version

**File:** `packages/api-routes/src/index.ts` (modify)
**Purpose:** Allow optional `version` field in ingest request

### Steps

1. Add to `IngestSessionInputSchema`:
   ```typescript
   version: z.number().int().min(1).max(255).optional(),
   ```

2. Verify: type check passes

---

## Task 6: Remove `registerScanOnlyAdapter` — Pi gets its own source

**File:** `packages/agent-adapters/src/registry.ts` (modify)
**File:** `packages/agent-adapters/src/index.ts` (modify)
**Purpose:** Pi now has `source: "pi"`, so it can be a normal registered adapter

### Steps

1. Change `registerScanOnlyAdapter(piAdapter)` → `registerAdapter(piAdapter)`
2. Remove `registerScanOnlyAdapter` function and `scanOnlyAdapters` array
3. Remove `registerScanOnlyAdapter` export from `index.ts`
4. Simplify `getAllAdapters()` back to just `adapters.values()`

---

## Task 7: Simplify CLI code — remove adapter resolution hacks

**Files:** (modify)
- `apps/cli/src/commands/upload.ts`
- `apps/cli/src/commands/dev/list-sessions.ts`

**No changes needed:**
- `apps/cli/src/lib/session-resolver.ts` — still needs `isPiSessionDir`, `getV3SessionsDir`, `readJsonlFirstLine` for local disk session resolution (finding sessions by path or ID). These are about filesystem discovery, not source dispatch.
- `apps/cli/src/commands/enable.ts` — empty hook path check is still valid

**Purpose:** Since Pi now has its own source key, `getAdapter(project.source)` returns the right adapter. Remove `resolveAdapter()`, `getAdapterLabel()`, and `isPiSession()` checks.

### Steps

1. In `upload.ts`:
   - Remove `resolveAdapter()` helper — use `getAdapter(project.source)` directly
   - Remove `isPiSession` imports
   - `getAdapterLabel` → just `getAdapter(project.source).name`

2. In `list-sessions.ts`:
   - Remove `getAdapterName()` async helper — use `getAdapter(project.source).name`
   - Remove `isPiSession`/`piAdapter` imports

---

## Task 8: Update tests

**File:** `apps/cli/src/__tests__/agents.test.ts` (modify)
**Purpose:** Update tests to reflect new source and raw storage

### Steps

1. Update Pi adapter tests:
   - `source` is now `"pi"` (not `"claude_code"`)
   - `buildUploadRequest` for v3 should return **raw** content (not transformed)
   - Remove `transformV3Content` tests (function removed)
   - Update v2 `buildUploadRequest` test — content is still concatenated subagent JSONL
   - `extractTimestamps` tests should work on raw content for both v2 and v3

2. Remove `transformV3Content` import from test file

3. Update `scanAllSessions` test — Pi sessions now have `source: "pi"`, not `"claude_code"`

---

## Task 9: Verify full build

### Steps

1. `bun run verify` — must pass (typecheck + lint + tests)
2. Manual check: read the modified files to verify no stale references to:
   - `registerScanOnlyAdapter`
   - `transformV3Content` (should be gone from exports/imports)
   - `source: "claude_code"` in pi adapter

---

## Task 10: Update PR

### Steps

1. Commit with message: `refactor: store pi sessions raw with own table + MVs`
2. Force-push to the PR branch
3. Reply to KeKs0r's comment summarizing changes

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| MV SQL for v3 format may have parsing bugs | Test with real v3 session data locally before pushing |
| chkit generates MVs before tables | Manually reorder migration SQL (documented known issue) |
| `session_analytics` column mismatch | Both MVs use `SELECT * EXCEPT(...)` pattern like existing MVs |
| v2 subagent content is already Claude Code format | v2 MV can literally be the Claude Code MV with `WHERE version = 2` |
| Migration needs to be applied to prod ClickHouse | Coordinate with KeKs0r on migration timing |

## Dependency Order

```
Task 1 (SourceSchema) 
  → Task 5 (IngestSessionInput version field)
  → Task 2 (pi-sessions schema) 
  → Task 3 (generate migration + codegen)
  → Task 4 (adapter changes)
  → Task 6 (registry cleanup)
  → Task 7 (CLI cleanup)
  → Task 8 (tests)
  → Task 9 (verify)
  → Task 10 (PR update)
```

Tasks 1 and 5 can be done together. Tasks 6 and 7 can be done together.
