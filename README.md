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

- `apps/desktop-tauri`: thin Tauri shell and invoke adapter
- `packages/desktop-ui`: product UI, product screens, and local engine port
- `apps/api`: Bun API for team blueprints and sync
- `packages/api-routes`: typed cloud API contracts
- `packages/sql-schema`: Postgres schema
- `packages/skill-schema`: shared skill blueprint schema
- `packages/skill-compiler`: deterministic agent-output compiler
- `crates/rudel-local`: local scan, lockfile, write planning, safe writes, git diff, SQLite, and undo

TypeScript owns drift classification; Rust owns local mechanics.

## Parked Infrastructure

- `packages/ch-schema`: ClickHouse transcript/session pipeline for later paid session intelligence
- `apps/cli`: future automation / CI / hook helper reference
- `packages/agent-adapters`: transcript adapter reference for later paid session infrastructure

## Reference Library

- `_archive/web`: archived dashboard reference. Extract reviewed pieces into `packages/desktop-ui` or `packages/ui` before product use.

## Product rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.

TypeScript owns drift classification; Rust owns local mechanics.
