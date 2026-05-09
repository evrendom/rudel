# Rudel Desktop Architecture

Rudel Desktop is a private, desktop-first Skill Blueprint product.

The active architecture centers on a local desktop app, a local Rust authority layer, a shared TypeScript skill model, and a cloud API for team sync.

## Product Rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.

## Active Surfaces

- `apps/desktop`: Tauri + React desktop product UX
- `apps/api`: Bun API for auth, teams, blueprints, modules, overlays, installs, and sync
- `packages/api-routes`: typed cloud API contracts
- `packages/sql-schema`: Postgres schema
- `packages/skill-schema`: shared TypeScript/Zod skill domain model
- `packages/skill-compiler`: deterministic compiler from blueprint + overlay + target to generated artifacts
- `crates/rudel-local`: local scan, drift, lockfile, write planning, and sync
- `crates/rudel-fs`: path safety, atomic writes, undo, and watchers
- `crates/rudel-git`: git status and diff helpers
- `crates/rudel-adapters`: local agent skill path discovery and target knowledge

## Dormant Future Infrastructure

- `packages/ch-schema`: ClickHouse session/transcript analytics schema
- `packages/agent-adapters`: old transcript/session adapter reference
- `apps/cli`: future internal automation and CI tooling

These packages stay in the repo, but they are not part of the v1 MLP runtime.

## Reference Only

`_archive/web` contains the old hosted dashboard and wrapped product surface. It is reference-only. Do not import from it, wrap it in Tauri, or let old dashboard/session analytics assumptions drive the desktop MLP.

## TypeScript Responsibilities

TypeScript owns:

- visual editor
- skill schema
- blueprint/module/overlay semantics
- agent-target compiler
- generated Markdown
- review rendering
- cloud API client
- desktop UI state

## Rust Responsibilities

Rust owns:

- folder permissions
- workspace scan
- file watching
- hashing
- lockfile read/write
- drift detection
- write planning
- atomic writes
- undo
- git diff/status
- local SQLite

TypeScript decides what generated artifacts should be produced. Rust decides whether and how those artifacts are safely written.

## Data Stores

Local SQLite is used by desktop for approved roots, repo inventory, local skill artifacts, cached team blueprints, compiled outputs, installations, lockfile snapshots, drift findings, write plans, write operations, undo records, and sync queues.

Postgres is used by the API for users, organizations, memberships, teams, skill blueprints, blueprint versions, modules, repo overlays, repo registry, and team install records.

ClickHouse is future-only for paid session transcripts, session events, repo/git metadata, skill intelligence events, and usage analytics.

For v1, do not call ClickHouse.
