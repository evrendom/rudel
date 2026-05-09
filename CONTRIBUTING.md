# Contributing

This is a private repo for Rudel Desktop: Skill Blueprints.

## Active product

Rudel Desktop is a desktop-first product for keeping agent skills componentized, inherited, composed, compiled, and synced across repos and coding agents.

## Required for v1 development

- Bun
- Rust
- Tauri prerequisites
- Postgres connection for API development

## Parked for later

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

- Use active packages instead of importing from `_archive/web`
- Keep ClickHouse env vars optional for v1
- Keep ClickHouse startup outside the default API path
- Keep local session processing outside the MLP
- Keep desktop as the primary product UX
- Managed local file writes must go through Rust write plans
