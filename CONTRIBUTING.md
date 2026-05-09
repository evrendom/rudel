# Contributing

This is a private repo for Rudel Desktop: Skill Blueprints.

## Active product

Rudel Desktop is a desktop-first product for keeping agent skills componentized, inherited, composed, compiled, and synced across repos and coding agents.

## Required for v1 development

- Bun
- Rust
- Tauri prerequisites
- Postgres connection for API development

## Not required for v1

- ClickHouse
- Docker Compose
- self-hosting
- hosted web app
- public CLI install

## Common commands

```bash
bun install
bun run dev:desktop
bun run dev:api
bun run verify:mlp
```

## Architecture rule

Desktop edits skills.
Rust writes files.
Cloud syncs teams.
ClickHouse understands paid sessions later.

## Pull request rules

- Do not import from `_archive/web`
- Do not require ClickHouse env vars for v1
- Do not initialize ClickHouse in API startup
- Do not add local session processing
- Do not make CLI the primary product UX
- Managed local file writes must go through Rust write plans
