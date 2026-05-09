# Rudel Desktop

Rudel Desktop is a private desktop-first product for managing team agent skills as canonical blueprints.

The current product focus is Skill Blueprints:

> One source of truth for a skill. Many repo/agent-specific outputs. No drift.

## Current MLP

Rudel helps teams solve:

- componentized skills
- inheritance through blueprints and overlays
- composition through reusable modules
- Claude / Codex / Cursor output sync
- repo/toolchain-specific skill variants
- skill drift across repos
- safe local file updates with diffs and undo

## Active architecture

- `apps/desktop`: Tauri + React desktop app
- `apps/api`: Bun API for team blueprints and sync
- `packages/api-routes`: typed cloud API contracts
- `packages/sql-schema`: Postgres schema
- `packages/skill-schema`: shared skill blueprint schema
- `packages/skill-compiler`: deterministic agent-output compiler
- `crates/rudel-local`: local scan, drift, write planning, and sync
- `crates/rudel-fs`: safe filesystem operations
- `crates/rudel-git`: git status and diff helpers

## Dormant future infrastructure

- `packages/ch-schema`: future ClickHouse transcript/session pipeline
- `apps/cli`: future automation / CI / hook helper reference
- `packages/agent-adapters`: future transcript adapter reference

## Reference only

- `_archive/web`: old web dashboard reference. Do not import from it.

## Product rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.
