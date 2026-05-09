# Rudel Agent Instructions

## Product identity

This repo is no longer the old open-source Rudel web/CLI session analytics tool.

It is now a private, closed-source, desktop-first Skill Blueprint product.

The current MLP solves one customer pain:

> One source of truth for a skill. Many repo/agent-specific outputs. No drift.

## Current MLP

The MLP solves:

- componentized skills
- skill inheritance through blueprints and overlays
- skill composition through reusable modules
- repo/toolchain-specific skill variants
- Claude / Codex / Cursor output sync
- local installs into real repo files
- lockfile-backed drift detection
- safe update plans with diffs and undo

Do not expand the product into company brain, marketplace, observability, or session intelligence unless explicitly asked.

## Active architecture

Active product surfaces:

- `apps/desktop`: Tauri + React desktop app
- `apps/api`: Bun API for auth, teams, blueprints, modules, overlays, installs
- `packages/api-routes`: typed cloud API contracts
- `packages/sql-schema`: Postgres schema
- `packages/skill-schema`: shared TypeScript/Zod schema for skill objects
- `packages/skill-compiler`: pure compiler from blueprint + overlay + target to generated files
- `packages/skill-renderer`: optional review/preview rendering
- `crates/rudel-local`: local scan, drift, lockfile, write planning
- `crates/rudel-fs`: atomic writes, watchers, undo, path safety
- `crates/rudel-git`: git status and diff helpers
- `crates/rudel-adapters`: local agent skill path discovery and target knowledge

## Dormant future infrastructure

These exist for the future but are not part of the v1 MLP runtime:

- `packages/ch-schema`: ClickHouse session/transcript analytics schema
- `packages/agent-adapters`: old transcript/session adapters
- `apps/cli`: future CI/automation/tooling reference
- old session ingestion code

Do not wire ClickHouse, transcript ingestion, session intelligence, or CLI flows unless explicitly asked.

## Reference-only code

`_archive/web` is the old web dashboard. It is reference-only.

Do not:

- import from `_archive/web`
- rebuild the web app
- wrap the old web app in Tauri
- copy old web routes into desktop
- let old dashboard/session analytics assumptions guide desktop UX

Useful UI pieces may be manually extracted into `packages/ui` after review.

## Product rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.

## TypeScript vs Rust responsibilities

TypeScript owns:

- visual editor
- skill schema
- blueprint/module/overlay semantics
- agent output compiler
- generated Markdown/review rendering
- cloud API client

Rust owns:

- folder permissions
- filesystem scanning
- file watching
- lockfile reads/writes
- hashing and drift detection
- install/update write plans
- atomic writes
- undo records
- git status/diff

The UI must not directly perform managed filesystem writes. Use Rust commands and write plans.

## Core domain model

The main product objects are:

- `SkillBlueprint`
- `SkillModule`
- `RepoOverlay`
- `AgentTarget`
- `SkillInstallation`
- `SkillLockfile`
- `DriftFinding`
- `InstallPlan`

Use blueprints + modules + overlays instead of arbitrary inheritance trees.

Inheritance should mean:

base blueprint
+ reusable modules
+ repo-specific variables
+ optional appended blocks

Do not implement complex class-style inheritance for skills.

## Agent targets

P0 targets:

- Claude Code
- Codex / `.agents`
- Cursor
- AGENTS.md

Generated outputs may include:

- `.claude/skills/<slug>/SKILL.md`
- `.agents/skills/<slug>/SKILL.md`
- `.cursor/skills/<slug>/SKILL.md`
- `.cursor/rules/<slug>.mdc`
- `AGENTS.md` snippets

## Lockfile

Managed repos use:

`.rudel/skills.lock.json`

The lockfile tracks:

- blueprint ID
- blueprint version
- repo overlay hash
- generated hash
- current file hash
- agent target
- target path
- install status

Statuses:

- `current`
- `behind`
- `modified`
- `missing`
- `conflict`
- `forked`
- `unmanaged`

## Write safety

Every managed local file write must go through a write plan.

A write plan should show:

- files to create
- files to modify
- files to skip
- target paths
- generated content
- git diff
- warnings
- undo availability

Never silently overwrite modified local files.

## V1 non-goals

Do not build these unless explicitly requested:

- hosted web product
- self-hosting
- Docker local infra
- public OSS docs
- generic company brain
- Slack/meeting ingestion
- session intelligence
- ClickHouse ingestion
- marketplace
- full visual canvas editor
- complex enterprise admin
- user-facing CLI as primary UX

## Current priority

Build the paid-customer MLP in this order:

1. Tauri desktop shell
2. Rust local scanner
3. local SQLite cache
4. skill schema
5. skill compiler
6. blueprint editor
7. repo overlays
8. install planner
9. lockfile
10. drift matrix
11. team sync
12. pilot on one real customer skill
