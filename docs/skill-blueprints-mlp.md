# Skill Blueprints MLP

The MLP solves one customer pain:

> One source of truth for a skill. Many repo/agent-specific outputs. No drift.

## Build Now

- Tauri desktop app
- Rust local engine
- team blueprint API
- Postgres team state
- skill schema
- skill compiler
- repo overlays
- agent target compilers
- lockfile
- TypeScript-owned drift classification
- safe write planner

## Current Implementation Boundary

TypeScript owns drift classification; Rust owns local mechanics.

TypeScript owns:

- slug inference
- blueprint matching
- inventory grouping
- drift classification
- lockfile entry creation from generated artifacts

Rust owns:

- scan
- path normalization
- git remote normalization
- hash primitives
- lockfile read/write
- write plans
- managed section writes
- git diff

Planned, not implemented:

- local SQLite persistence
- watcher
- persistent undo
- real GitHub identity linking UI

## KISS Shell Structure

- `apps/desktop-tauri`: thin shell
- `packages/desktop-ui`: product UI and product logic
- `crates/rudel-local`: one Rust local engine crate
- `packages/skill-schema`: one skill schema
- `packages/skill-compiler`: one compiler
- `apps/api`: team sync API

Tauri is the first shell, not the architecture. Product UI receives a `LocalEngine` through props/context, and shell-specific code stays in `apps/desktop-tauri`.

## Parked Infrastructure

- ClickHouse session/transcript pipeline
- CLI / CI tooling
- session intelligence
- transcript upload helper

## Reference Library

- `_archive/web`
- archived dashboard UI
- archived session analytics views
- archived self-host docs

## Later Scope

- hosted product
- self-hosting
- skill catalog
- generic company brain
- Slack/meeting ingestion
- session intelligence
- full visual canvas editor
- enterprise governance
- user-facing CLI

## Core Objects

- `SkillBlueprint`: canonical source of truth
- `SkillModule`: reusable component
- `RepoOverlay`: repo-specific adaptation
- `AgentTarget`: Claude Code, Codex, Cursor, or AGENTS.md output
- `SkillInstallation`: a managed local install
- `SkillLockfile`: `.rudel/skills.lock.json`
- `DriftFinding`: detected local/team mismatch
- `WritePlan`: safe write plan with diffs and warnings

Use blueprint + modules + repo overlays. Keep arbitrary inheritance trees outside the skill model.

## P0 Generated Outputs

- `.claude/skills/<slug>/SKILL.md`
- `.agents/skills/<slug>/SKILL.md`
- `.cursor/skills/<slug>/SKILL.md`
- `.cursor/rules/<slug>.mdc`
- `AGENTS.md` snippets

## MLP Screens

1. Workspace Home
2. Team Blueprint Library
3. Blueprint Editor
4. Repo x Agent Matrix
5. Write Planner
6. Drift Inbox

## Build Order

1. Tauri desktop shell
2. Rust local scanner
3. skill schema
4. skill compiler
5. interactive desktop shell
6. onboarding roots and scan
7. all-skills inventory
8. TypeScript Standards focus view
9. compile selected repo/targets
10. write planner
11. drift detail
12. team sync

## Paid Pilot

Recommended first skill: `test-runner` or `pr-review`.

Pilot flow:

1. Add customer workspace.
2. Scan repos.
3. Show duplicate/drifted skills.
4. Import one skill into a blueprint.
5. Define shared modules.
6. Define repo overlays.
7. Compile to Claude/Codex/Cursor.
8. Install into 2-3 repos.
9. Show `.rudel/skills.lock.json`.
10. Manually edit one generated skill.
11. Show TypeScript-classified drift.
12. Resolve with update, fork, or ignore.
