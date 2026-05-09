# Rudel Desktop Architecture

Rudel Desktop is a private, desktop-first Skill Blueprint product.

The active architecture centers on a local desktop app, a local Rust authority layer, a shared TypeScript skill model, and a cloud API for team sync.

## Product Rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.

TypeScript owns drift classification; Rust owns local mechanics.

## Active Surfaces

- `apps/desktop-tauri`: thin Tauri shell, bootstrap, command bridge, and invoke adapter
- `packages/desktop-ui`: product UI, product screens, and local engine port
- `apps/api`: Bun API for auth, teams, blueprints, modules, overlays, installs, and sync
- `packages/api-routes`: typed cloud API contracts
- `packages/sql-schema`: Postgres schema
- `packages/skill-schema`: shared TypeScript/Zod skill domain model
- `packages/skill-compiler`: deterministic compiler from blueprint + overlay + target to generated artifacts
- `crates/rudel-local`: implemented local mechanics for scan, path normalization, git remote normalization, hashes, lockfiles, write plans, managed section writes, and git diff

## Parked Infrastructure

- `packages/ch-schema`: ClickHouse session/transcript analytics schema for later paid session intelligence
- `packages/agent-adapters`: transcript/session adapter reference
- `apps/cli`: future internal automation and CI tooling

These packages stay in the repo as parked infrastructure. The v1 runtime centers on the Tauri shell, desktop UI package, API, skill schema, skill compiler, and one Rust local authority crate.

## Reference Library

`_archive/web` contains an archived dashboard reference library. Use it for review and extraction decisions, then move useful pieces into `packages/desktop-ui` or `packages/ui`.

## Shell Boundary

Tauri is the first shell, not the architecture.

`apps/desktop-tauri` owns Tauri bootstrap, window config, Tauri commands, and the invoke adapter. It passes a local engine implementation into `packages/desktop-ui`.

`packages/desktop-ui` owns the product UI. It receives local functions through the `LocalEngine` port and keeps product screens outside the shell.

`crates/rudel-local` owns local authority and stays shell-agnostic.

## TypeScript Responsibilities

TypeScript owns drift classification; Rust owns local mechanics.

TypeScript owns:

- visual editor
- product UI
- skill schema
- blueprint/module/overlay semantics
- slug inference
- blueprint matching
- inventory grouping
- drift classification
- lockfile entry creation from generated artifacts
- agent-target compiler
- generated Markdown
- review rendering
- cloud API client
- desktop UI state

## Rust Responsibilities

Rust owns:

- folder permissions
- scan
- path normalization
- git remote normalization
- hash primitives
- lockfile read/write
- write plans
- managed section writes
- atomic writes
- git diff

TypeScript decides what generated artifacts should be produced. Rust decides whether and how those artifacts are safely written.

## Planned, Not Implemented

- local SQLite persistence
- watcher
- persistent undo
- real GitHub identity linking UI

## Data Stores

Local SQLite is planned for approved roots, repo inventory, local skill artifacts, cached team blueprints, compiled outputs, installations, lockfile snapshots, TypeScript-classified drift findings, write plans, write operations, undo records, and sync queues. It is not implemented yet.

Postgres is used by the API for users, organizations, memberships, teams, skill blueprints, blueprint versions, modules, repo overlays, repo registry, and team install records.

ClickHouse is parked paid infrastructure for session transcripts, session events, repo/git metadata, skill intelligence events, and usage analytics.

For v1, keep ClickHouse outside the default runtime path.
