# Plan: Support Pi Sessions (v2 + v3)

**Issue:** https://github.com/obsessiondb/rudel/issues/153
**Date:** 2026-03-16

## Problem

Pi sessions are invisible to Rudel. There are two distinct pi storage formats:

### Pi v2 (old — Claude Code 2.1.x era)
- **Location:** `~/.claude/projects/<encoded-project>/<uuid>/subagents/agent-*.jsonl`
- **Format:** Same JSONL as Claude Code (type: "user"/"assistant", timestamp, message.usage.input_tokens)
- **Count:** ~282 sessions
- **Already implemented** in our current branch — working and tested.

### Pi v3 (current — pi version 3)
- **Location:** `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<uuid>.jsonl`
- **Format:** Completely different schema:
  - First line: `{type: "session", version: 3, id, timestamp, cwd}`
  - Messages: `{type: "message", message: {role: "user"/"assistant"/"toolResult", ...}}`
  - Other events: `compaction`, `thinking_level_change`, `model_change`
  - Usage keys: `{input, output, cacheRead, cacheWrite, totalTokens, cost}` 
  - Extra message keys: `api`, `provider`, `stopReason`
- **Dir encoding:** `--Users-adam1-Code-pano--` (double-dash prefix/suffix, leading slash stripped)
- **Filename:** `<ISO-timestamp-with-dashes>_<uuid>.jsonl`
- **Count:** ~846 sessions — the bulk of recent work
- **Not yet implemented.**

### MV compatibility

The ClickHouse materialized view (`session_analytics_mv`) parses `content` line-by-line expecting Claude Code format:
- `type: "user"` / `type: "assistant"` at the line level (not nested in `message.role`)
- `message.usage.input_tokens` (not `usage.input`)
- `message.model` (same location in both formats)
- Error markers: `"isApiErrorMessage":true`, `"is_error":true`

**Pi v3 lines are incompatible.** We must transform pi v3 → Claude Code format in `content` for analytics to work.

---

## Approach

Extend the existing Pi adapter to handle both v2 and v3:

1. **Two session base dirs** — scan both `~/.claude/projects/` (v2) and `~/.pi/agent/sessions/` (v3)
2. **Format detection** — v3 sessions have `{type: "session", version: 3}` as the first line; v2 `transcriptPath` is a directory
3. **Content transformation** — convert v3 JSONL to Claude Code-compatible JSONL so the MV works
4. **Project path from `cwd`** — v3 session headers contain the authoritative `cwd` field; use it directly instead of decoding the directory name (avoids ambiguity)
5. **No API/schema changes** — still uses `source: "claude_code"` and `claude_sessions` table

### Content transformation (v3 → Claude Code format)

For each v3 line with `type: "message"` and `role: "user"` or `role: "assistant"`:

```
Input:  {"type":"message","id":"x","parentId":"y","timestamp":"T","message":{"role":"user","content":[...]}}
Output: {"type":"user","timestamp":"T","message":{"role":"user","content":[...]}}

Input:  {"type":"message","id":"x","parentId":"y","timestamp":"T","message":{"role":"assistant","content":[...],"api":"...","provider":"...","model":"claude-opus-4-6","usage":{"input":3,"output":358,"cacheRead":16459,"cacheWrite":455,"totalTokens":17275,"cost":{...}},"stopReason":"end_turn","timestamp":12345}}
Output: {"type":"assistant","timestamp":"T","message":{"role":"assistant","content":[...],"model":"claude-opus-4-6","usage":{"input_tokens":3,"output_tokens":358,"cache_read_input_tokens":16459,"cache_creation_input_tokens":455}}}
```

**Dropped from output:** `id`, `parentId` (MV ignores), `api`, `provider`, `stopReason`, `message.timestamp` (numeric duplicate), `usage.totalTokens`, `usage.cost` (MV doesn't use).

**Skipped lines:** `toolResult` messages, `session`, `compaction`, `thinking_level_change`, `model_change` — MV ignores all of these.

### What we DON'T change

- Claude Code adapter — zero modifications
- API routes / SourceSchema — no changes
- ClickHouse schema — no migrations
- v2 support — already working

---

## Tasks

### Task 1: Add v3 session scanning to Pi adapter

**File:** `packages/agent-adapters/src/adapters/pi/index.ts` (modify)

Add v3 sessions base dir:

```typescript
const PI_V3_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");
```

New method `listV3Sessions(v3ProjectDir: string): Promise<SessionFile[]>`:
- Read `.jsonl` files from the dir
- For each file, read first line to get `{type: "session", cwd}` → use `cwd` as `projectPath`
- Extract session ID from filename: `filename.replace('.jsonl','').split('_')[1]`
- `transcriptPath` points to the `.jsonl` file (v3 is a single file, not a directory)

Update `scanAllSessions()`:
- Existing v2 scan (from `~/.claude/projects/`) — unchanged
- Add v3 scan: iterate `~/.pi/agent/sessions/` dirs, call `listV3Sessions` for each
- Merge into single result

Update `findProjectSessions(projectPath)`:
- Existing v2 path encoding + search — unchanged
- Add v3: encode as `--${path.replace(/^\//, '').replace(/[/\\:]/g, '-')}--`, search `PI_V3_SESSIONS_DIR`

Update `getSessionsBaseDir()`:
- Return `PI_V3_SESSIONS_DIR` — this is where current sessions live
- The v2 dir (`~/.claude/projects/`) always exists because it's shared with Claude Code adapter, so v2 scanning still works regardless

#### Verification
```bash
bun run check-types
bun test apps/cli/src/__tests__/agents.test.ts
```

### Task 2: Add v3 content transformation

**File:** `packages/agent-adapters/src/adapters/pi/index.ts` (modify)

New exported function `transformV3Content(rawContent: string): string`:
- Parse each line as JSON
- Skip lines where `type` is not `"message"`
- Skip messages where `role` is `"toolResult"`
- For `role: "user"`: emit `{type: "user", timestamp, message: {role, content}}`
- For `role: "assistant"`: emit `{type: "assistant", timestamp, message: {role, content, model, usage}}` where usage keys are mapped:
  - `input` → `input_tokens`
  - `output` → `output_tokens`
  - `cacheRead` → `cache_read_input_tokens`
  - `cacheWrite` → `cache_creation_input_tokens`
  - Drop `totalTokens`, `cost`
- Drop `api`, `provider`, `stopReason`, numeric `message.timestamp` from output
- Return newline-joined transformed lines

New exported function `isV3Session(firstLine: string): boolean`:
- Parse first line, check `type === "session"` and `version === 3`

Update `buildUploadRequest(session, context)`:
- Detect format: `stat(transcriptPath)` — directory = v2, file = v3
- **v2 path (directory):** existing logic — read subagent files, concatenate into `content`, populate `subagents`
- **v3 path (file):** read file, transform content via `transformV3Content`, set as `content`, no `subagents`

#### Verification
```bash
bun test apps/cli/src/__tests__/agents.test.ts
```

### Task 3: Add `isPiSession` utility

**File:** `packages/agent-adapters/src/adapters/pi/index.ts` (modify)

New exported function `isPiSession(transcriptPath: string): Promise<boolean>`:
- If `isPiSessionDir(path)` → true (v2)
- If path is under `PI_V3_SESSIONS_DIR` → true (v3, fast path check)
- Otherwise → false

This replaces all callsites that currently use `isPiSessionDir` — covers both formats.

**File:** `packages/agent-adapters/src/index.ts` (modify)
- Export `isPiSession` alongside existing exports

#### Verification
```bash
bun run check-types
```

### Task 4: Update session resolver for v3

**File:** `apps/cli/src/lib/session-resolver.ts` (modify)

Update `resolveFromId(sessionId)`:
- After existing v2 checks, search v3: iterate `~/.pi/agent/sessions/` dirs, look for files matching `*_${sessionId}.jsonl`
- Read first line to get `cwd` for `projectPath`

Update `resolveFromPath(filePath)`:
- After directory check (v2), before file-based resolution:
- If path is under `~/.pi/agent/sessions/` and ends with `.jsonl`:
  - Extract session ID from filename
  - Read first line for `cwd` → `projectPath`
  - Return `SessionInfo`

Import `isPiSession` instead of `isPiSessionDir`.

#### Verification
```bash
bun test apps/cli/src/__tests__/agents.test.ts
```

### Task 5: Update upload + list-sessions to use `isPiSession`

**File:** `apps/cli/src/commands/upload.ts` (modify)
- Replace `isPiSessionDir` import with `isPiSession`
- Update `resolveAdapter`, `runSingleUpload`, and retry path

**File:** `apps/cli/src/commands/dev/list-sessions.ts` (modify)
- Replace `isPiSessionDir` with `isPiSession` in `getAdapterName`

#### Verification
```bash
bun run check-types
```

### Task 6: Add v3 tests

**File:** `apps/cli/src/__tests__/agents.test.ts` (modify)

Add v3 test fixtures — create temp dir under `~/.pi/agent/sessions/` with the double-dash encoding:

```typescript
const V3_SESSION_ID = "b1c2d3e4-f5a6-7890-abcd-ef1234567890";
const V3_SESSIONS_BASE = join(homedir(), ".pi", "agent", "sessions");
const V3_PROJECT_DIR = `--${TEST_PROJECT_PATH.replace(/^\//, '').replace(/\//g, '-')}--`;
const V3_SESSION_DIR = join(V3_SESSIONS_BASE, V3_PROJECT_DIR);
const V3_SESSION_FILE = join(V3_SESSION_DIR, `2026-03-10T10-00-00-000Z_${V3_SESSION_ID}.jsonl`);
```

V3 sample content:
```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"<TEST_PROJECT_PATH>"}
{"type":"thinking_level_change","id":"x","parentId":null,"timestamp":"...","thinkingLevel":"high"}
{"type":"message","id":"a","parentId":"x","timestamp":"2026-03-10T10:00:05.000Z","message":{"role":"user","content":[{"type":"text","text":"fix the bug"}]}}
{"type":"message","id":"b","parentId":"a","timestamp":"2026-03-10T10:00:15.000Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll fix it."}],"model":"claude-sonnet-4-20250514","usage":{"input":100,"output":50,"cacheRead":500,"cacheWrite":200,"totalTokens":850,"cost":{"total":0.01}}}}
{"type":"message","id":"c","parentId":"b","timestamp":"2026-03-10T10:00:15.100Z","message":{"role":"toolResult","toolCallId":"t1","toolName":"bash","content":[{"type":"text","text":"done"}]}}
{"type":"compaction","id":"d","parentId":"c","timestamp":"...","summary":"Fixed the bug","firstKeptEntryId":"a","tokensBefore":1000}
```

Tests:
- `scanAllSessions finds v3 sessions` — v3 session appears with correct sessionId and projectPath
- `buildUploadRequest transforms v3 content` — verify output has `type: "user"/"assistant"` lines, usage keys mapped, toolResult/compaction/session lines stripped
- `buildUploadRequest strips extra v3 fields` — no `api`, `provider`, `stopReason`, `cost`, `totalTokens` in output
- `extractTimestamps works on transformed v3 content`
- `isPiSession detects v3 sessions` — returns true for v3 file path
- `findProjectSessions returns v3 sessions`

Cleanup: remove v3 temp dir in `afterAll`.

#### Verification
```bash
bun test apps/cli/src/__tests__/agents.test.ts
```

### Task 7: Full verification + real upload

```bash
bun run check-types
bun run lint
bun test

# Real v3 session dry-run
bun run --cwd apps/cli dev -- upload --dry-run 06e627d2-3547-4e59-9a96-27a835d899cf

# Real v3 upload
bun run --cwd apps/cli dev -- upload 06e627d2-3547-4e59-9a96-27a835d899cf

# List sessions — verify v3 shows as [Pi]
bun run --cwd apps/cli dev -- dev list-sessions
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| v3 session with only `toolResult` messages | Transformed content empty. `extractTimestamps` returns null → uses `now`. |
| v3 `compaction` entries | Skipped — summaries, not interactions |
| v3 `thinking_level_change`/`model_change` | Skipped — metadata |
| Mixed v2 + v3 for same project | Both appear, grouped by git remote in picker |
| v3 filename parsing | `<timestamp>_<uuid>.jsonl` → split on first `_`, take second part |
| v3 dir encoding | `--Users-adam1-Code-pano--` — distinct from v2 (`-Users-adam1-Code-pano`) |
| `getSessionsBaseDir()` | Returns v3 dir. v2 dir (`~/.claude/projects/`) always exists (shared with CC adapter) so v2 scan still works. |
| v3 projectPath | Read from `cwd` in session header — authoritative, no ambiguous decoding |
| v3 extra message fields | `api`, `provider`, `stopReason`, `cost`, `totalTokens` stripped in transform to reduce content size |
| v3 session without `cwd` | Defensive: fall back to decoding dir name if `cwd` missing |

## Risks

| Risk | Mitigation |
|------|-----------|
| Content transformation misses MV fields | Test with real session data, verify `type`, `timestamp`, `message.usage.input_tokens`, `message.model` all present |
| Usage field mapping wrong | Verified from actual sessions: `input`→`input_tokens`, `output`→`output_tokens`, `cacheRead`→`cache_read_input_tokens`, `cacheWrite`→`cache_creation_input_tokens` |
| Large sessions (7MB+) | Transformation reduces size by stripping extra fields; same I/O as existing sessions |
| Future pi format changes | `version: 3` detection allows future version handling |
| v3 scanning perf (846 files × first-line read) | Each read is <1KB. 846 reads at ~0.1ms each ≈ 85ms total. Acceptable for a CLI scan. |

## Files Changed Summary

| File | Change |
|------|--------|
| `packages/agent-adapters/src/adapters/pi/index.ts` | **Modify** — v3 scanning, content transform, `isPiSession` |
| `packages/agent-adapters/src/index.ts` | **Modify** — export `isPiSession` |
| `apps/cli/src/lib/session-resolver.ts` | **Modify** — v3 session resolution |
| `apps/cli/src/commands/upload.ts` | **Modify** — use `isPiSession` |
| `apps/cli/src/commands/dev/list-sessions.ts` | **Modify** — use `isPiSession` |
| `apps/cli/src/commands/enable.ts` | **No change** |
| `apps/cli/src/__tests__/agents.test.ts` | **Modify** — v3 test fixtures and tests |
