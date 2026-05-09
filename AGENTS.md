# Rudel Agent Instructions

## Product Identity

Rudel is a private, desktop-first Skill Blueprint product.

The current MLP solves one customer pain:

> One source of truth for a skill. Many repo/agent-specific outputs. No drift.

## Current MLP

Build the product around:

- componentized skills
- skill inheritance through blueprints and overlays
- skill composition through reusable modules
- repo/toolchain-specific skill variants
- Claude / Codex / Cursor output sync
- local installs into real repo files
- lockfile-backed drift detection
- safe update plans with diffs and undo

Keep company brain, marketplace, observability, and session intelligence work outside the MLP until explicitly requested.

## Active Architecture

Active product surfaces:

- `apps/desktop-tauri`: thin Tauri shell, bootstrap, command bridge, and invoke adapter
- `packages/desktop-ui`: product UI, product screens, and local engine port
- `apps/api`: Bun API for auth, teams, blueprints, modules, overlays, installs
- `packages/api-routes`: typed cloud API contracts
- `packages/sql-schema`: Postgres schema
- `packages/skill-schema`: shared TypeScript/Zod schema for skill objects
- `packages/skill-compiler`: pure compiler from blueprint + overlay + target to generated files
- `crates/rudel-local`: local scan, watch, hash, drift, lockfile, write plan, git diff, SQLite, safe writes, undo

## Parked Infrastructure

These areas stay in the repo as parked infrastructure for later paid surfaces:

- `packages/ch-schema`: ClickHouse session/transcript analytics schema
- `packages/agent-adapters`: transcript/session adapter reference
- `apps/cli`: future CI/automation/tooling reference
- session ingestion code

For the MLP, route runtime work through `apps/desktop-tauri`, `packages/desktop-ui`, `crates/rudel-local`, Postgres, skill schema, and skill compiler packages.

## Reference Library

`_archive/web` is an archived dashboard reference library.

Use it only as reviewed reference material. Extract useful UI pieces into `packages/desktop-ui` or `packages/ui` before using them in product code.

Build desktop UX from the Skill Blueprint workflow, local write planning, and drift management model.

## Product Rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.

## TypeScript And Rust Ownership

TypeScript owns:

- visual editor
- product UI shell-agnostic screens
- skill schema
- blueprint/module/overlay semantics
- agent output compiler
- generated Markdown/review rendering
- cloud API client

Rust owns:

- folder permissions
- filesystem scanning
- file watching
- local SQLite
- lockfile reads/writes
- hashing and drift detection
- install/update write plans
- atomic writes
- undo records
- git status/diff

Route managed filesystem writes through `crates/rudel-local` and Tauri commands.

## Shell Boundary

Tauri is the first shell, not the architecture.

`apps/desktop-tauri` mounts:

```tsx
<RudelDesktopApp localEngine={tauriLocalEngine} />
```

Keep product UI and product logic in `packages/desktop-ui`.
Keep local machine authority in `crates/rudel-local`.
Keep Tauri-specific code in `apps/desktop-tauri`.

## Core Domain Model

The main product objects are:

- `SkillBlueprint`
- `SkillModule`
- `RepoOverlay`
- `AgentTarget`
- `SkillInstallation`
- `SkillLockfile`
- `DriftFinding`
- `InstallPlan`

Use blueprints + modules + overlays as the inheritance model.

Inheritance means:

base blueprint
+ reusable modules
+ repo-specific variables
+ optional appended blocks

Keep class-style inheritance out of the skill model.

## Agent Targets

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

## Write Safety

Every managed local file write goes through a write plan.

A write plan shows:

- files to create
- files to modify
- files to skip
- target paths
- generated content
- git diff
- warnings
- undo availability

Preserve modified local files unless the user explicitly approves an overwrite.

## V1 Boundaries

Keep these outside the MLP until explicitly requested:

- hosted web product
- self-hosting
- Docker local infra
- public docs
- generic company brain
- Slack/meeting ingestion
- session intelligence
- ClickHouse ingestion
- marketplace
- full visual canvas editor
- complex enterprise admin
- user-facing CLI as primary UX

## Current Priority

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
