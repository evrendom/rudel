# Contributing to Rudel

Thanks for your interest in contributing! This guide covers setup, workflow, and expectations.

## Prerequisites

- [Bun](https://bun.sh) (v1.3+)
- [Docker](https://docker.com) (or [OrbStack](https://orbstack.dev))

## Setup

```bash
git clone https://github.com/evrendom/rudel.git
cd rudel
bun install
bun run dev:local
```

This starts local Postgres + ClickHouse via Docker Compose, runs migrations, and launches:

- **API** at `http://localhost:4010`
- **Web app** at `http://localhost:4011`

Sign up with email/password to create a local account. Social login (Google/GitHub) is not available in local mode.

## Development Commands

```bash
bun run dev:local     # Start everything (infra + API + web)
bun run infra:up      # Start database containers only
bun run infra:down    # Stop database containers
bun run lint          # Run Biome linter
bun run lint:fix      # Auto-fix lint issues
bun run format        # Format code with Biome
bun run check-types   # TypeScript type checking
bun run test          # Run tests
```

## Before Submitting a PR

Run the full verification suite:

```bash
bun run verify
```

This runs linting, type checking, tests, and builds across the entire monorepo. Do not open a PR if `verify` fails.

## Pull Request Guidelines

- **PR titles must use [conventional commit](https://www.conventionalcommits.org/) format**. This is enforced by CI. Use one of:
  `feat:` | `fix:` | `docs:` | `style:` | `refactor:` | `perf:` | `test:` | `build:` | `ci:` | `chore:` | `revert:`
- Keep PRs focused — one logical change per PR.
- Include a description of what changed and why.
- If your change affects the CLI, test it locally with `bun run --cwd apps/cli dev`.

## Project Structure

```
apps/
  api/          HTTP API server (Bun)
  cli/          CLI tool (published to npm as `rudel`)
  web/          React SPA (Vite + Tailwind + shadcn)

packages/
  api-routes/   Shared RPC contract
  ch-schema/    ClickHouse schemas, migrations, codegen
  sql-schema/   Drizzle ORM schema for Postgres
  typescript-config/  Shared tsconfig bases
```

## Reporting Bugs

Open an issue at [github.com/evrendom/rudel/issues](https://github.com/evrendom/rudel/issues) with steps to reproduce.

## Security Issues

Please report security vulnerabilities privately. See [SECURITY.md](SECURITY.md) for details.
