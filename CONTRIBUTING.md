# Contributing to Rudel

This repo is in a private desktop-first transition. The old hosted dashboard is archived in `_archive/web` and is not an active app.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Access to the required API/database environment variables for API work

## Setup

```bash
bun install
```

Run the API directly when working on active backend code:

```bash
bun run --cwd apps/api dev
```

## Development Commands

```bash
bun run lint          # Run Biome checks
bun run lint:fix      # Auto-fix Biome issues
bun run format        # Format code with Biome
bun run check-types   # TypeScript type checking
bun run test          # Run tests
bun run build         # Build active workspaces
```

## Before Submitting a PR

Run the relevant checks for the files you changed. For broad changes, run:

```bash
bun run lint
bun run check-types
bun run test
bun run build
```

## Project Structure

```txt
apps/
  api/          HTTP API server
  cli/          Temporary internal CLI/reference tooling

packages/
  agent-adapters/      Agent transcript adapters
  api-routes/          Shared RPC contract
  ch-schema/           ClickHouse schemas, migrations, codegen
  sql-schema/          Drizzle ORM schema for Postgres
  typescript-config/   Shared tsconfig bases

_archive/
  web/          Archived hosted dashboard and wrapped route reference
```

Do not import from `_archive/web` in active code. Extract reusable pieces into packages first.
