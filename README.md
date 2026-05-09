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

## Parked Infrastructure

- `packages/ch-schema`: ClickHouse transcript/session pipeline for later paid session intelligence
- `apps/cli`: future automation / CI / hook helper reference
- `packages/agent-adapters`: transcript adapter reference for later paid session infrastructure

## Reference Library

- `_archive/web`: archived dashboard reference. Extract reviewed pieces into active packages before product use.

## Product rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.
