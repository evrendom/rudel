# Rudel

Rudel is being reshaped into a private desktop-first product for Skill Blueprints: one canonical source of truth for team agent skills, repo-specific overlays, compiled local outputs, and drift detection.

The old hosted web dashboard has been archived under `_archive/web` for reference only. It is no longer part of the active Bun workspace, build, Docker image, or CI path.

## Active Workspace

```txt
apps/
  api/      Bun API server
  cli/      Temporary internal CLI/reference tooling

packages/
  api-routes/
  agent-adapters/
  ch-schema/
  sql-schema/
  typescript-config/
```

## Development

Install dependencies:

```bash
bun install
```

Run the active API:

```bash
bun run --cwd apps/api dev
```

Run checks:

```bash
bun run lint
bun run check-types
bun run test
bun run build
```

The archived web app should not be imported from active code. Future desktop work should extract reusable pieces into packages before use.
