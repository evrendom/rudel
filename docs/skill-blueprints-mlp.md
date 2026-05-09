# Skill Blueprints MLP

The MLP solves one customer pain:

> One source of truth for a skill. Many repo/agent-specific outputs. No drift.

## Build Now

- Tauri desktop app
- Rust local engine
- local SQLite
- team blueprint API
- Postgres team state
- skill schema
- skill compiler
- repo overlays
- agent target compilers
- lockfile
- drift detection
- safe install/update planner

## Keep Dormant

- ClickHouse session/transcript pipeline
- CLI / CI tooling
- session intelligence
- transcript upload helper

## Reference Only

- `_archive/web`
- old dashboard UI
- old session analytics views
- old OSS/self-host docs

## Do Not Build Now

- hosted web product
- self-hosting
- Docker local infra
- public marketplace
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
- `InstallPlan`: safe write plan with diffs, warnings, and undo availability

Use blueprint + modules + repo overlays. Do not implement arbitrary inheritance trees.

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
5. Install / Update Planner
6. Drift Inbox

## Build Order

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
12. paid pilot on one real customer skill

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
11. Show drift detection.
12. Resolve with update, fork, or ignore.
