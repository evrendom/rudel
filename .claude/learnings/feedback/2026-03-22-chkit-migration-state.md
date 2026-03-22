---
date: "2026-03-22 21:44:27"
sha: "7c96faf"
category: "missing-check"
status: pending
observed-workflows:
  subagents: ["code:codebase-locator"]
  skills: ["testing-bun"]
  commands: []
---

# Agent assumed migration state from local files instead of using chkit CLI

## Observation

Agent did not know the actual status of chkit migrations. It read `journal.json` (which showed `"applied": []`) and the existing migration SQL file, then made incorrect assumptions — claiming the migration was "already in main" and suggesting to "regenerate" it. The actual migration state is tracked in the ClickHouse instance, and the correct way to check it is via `chkit status` or `bun run ch:status`. The chkit skill was available and loaded but doesn't explicitly instruct the agent to check migration status before making deployment recommendations.

## Context

Working on adding Codex session support (NUM-6870). After writing the MV integration test, the user asked about the deployment workflow — how to generate a migration, apply it, and repopulate the MV. The agent read local files (`journal.json`, migration SQL) and drew wrong conclusions about what had been applied and what needed regenerating.

## Analysis

Two contributing factors:

1. **The chkit skill doesn't instruct agents to run `chkit status` before reasoning about migration state.** The skill documents `chkit status` as a command but doesn't include guidance like "always check migration status via the CLI before advising on deployment steps" — it's just listed as a reference. The agent defaulted to reading local files (journal.json, migration directory) which give an incomplete picture.

2. **The agent confused local snapshot/journal state with deployed state.** `journal.json` tracks what has been applied locally, but the agent read `"applied": []` and then made a leap to "the migration is already in main" based on the file existing. It should have either run `chkit status` or `bun run ch:status` to get the authoritative view, or at minimum been more careful about distinguishing "migration file exists" from "migration has been applied."
