---
name: environment-variables
description: Environment variable management patterns. CRITICAL use when adding new environment variables (secrets, API keys, config), debugging "X not defined" or missing env var errors, tests passing locally but failing in CI, Turborepo not passing env vars to tasks, or troubleshooting deployment configuration errors.
allowed-tools: [Read, Edit, Grep, Glob, Bash]
---

# Environment Variables Management

## Source of Truth: Doppler

All environment variables are stored in Doppler. Never hardcode secrets or commit them to git.

## Five Integration Points

When adding a new environment variable:

### 1. Doppler

Add to the appropriate Doppler project and environment.

### 2. GitHub CI Workflow

Map from GitHub Secrets in `.github/workflows/ci.yml`:

```yaml
jobs:
  test:
    env:
      CLICKHOUSE_URL: ${{ secrets.CLICKHOUSE_URL }}
      API_KEY: ${{ secrets.API_KEY }}
```

Secrets must exist in repository settings → Secrets → Actions first.

### 3. Package-Specific turbo.json

**CRITICAL**: Add to package-specific `turbo.json`, NOT root.

```json
{
  "extends": ["//"],
  "tasks": {
    "test": {
      "passThroughEnv": ["CLICKHOUSE_URL", "API_KEY"]
    }
  }
}
```

### 4. Miniflare Bindings (Cloudflare Workers Tests)

Map and validate in `vitest.config.ts`:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { ok } from "node:assert";

export default defineWorkersConfig(() => {
  const clickhouseUrl = process.env.CLICKHOUSE_URL;
  ok(clickhouseUrl, "CLICKHOUSE_URL not defined");

  const apiKey = process.env.API_KEY;
  ok(apiKey, "API_KEY not defined");

  return {
    test: {
      poolOptions: {
        workers: {
          miniflare: {
            bindings: {
              CLICKHOUSE_URL: clickhouseUrl,
              API_KEY: apiKey,
            },
          },
        },
      },
    },
  };
});
```

**Remember**: Workers access via `env.VAR_NAME`, not `process.env.VAR_NAME`.

### 5. Cloudflare Sync Scripts

Two approaches exist:

**A) JSON Export (exports all secrets)**

```json
"env:sync": "doppler secrets -p app -c prd --json | jq -c 'with_entries(.value = .value.computed)' > secrets.json && wrangler secret bulk < secrets.json && rm secrets.json"
```

**B) Template Substitution (requires secrets.json)**

```json
"env:sync": "doppler -p app -c prd secrets substitute secrets.json | wrangler secret bulk --env production"
```

**CRITICAL for Template Approach:**
Add new variables to `secrets.json`:

```json
{
  "CLICKHOUSE_URL": "{{.CLICKHOUSE_URL}}",
  "API_KEY": "{{.API_KEY}}"
}
```

Check which approach: Look for `secrets.json` file and inspect `env:sync` script in `package.json`.

## Checklist: Adding New Environment Variable

- [ ] Add to Doppler for all environments
- [ ] Add to GitHub Secrets (if used in CI)
- [ ] Add to `.github/workflows/ci.yml` (if used in CI)
- [ ] Add to package-specific `turbo.json` → `passThroughEnv`
- [ ] Add to `vitest.config.ts` miniflare bindings with `ok()` validation (if used in tests)
- [ ] Add to `secrets.json` template (if using substitution approach)
- [ ] Run `env:sync` and `env:sync:stg` (if available)
- [ ] Run `types` or `wrangler:types` script (if exists in package.json)
- [ ] Validate tests pass locally and in CI

## Debugging Missing Env Vars

Check in order:

1. **Doppler**: `doppler secrets get VAR_NAME`
2. **Package turbo.json**: `cat packages/your-package/turbo.json | grep -A 10 passThroughEnv`
3. **Miniflare bindings**: `cat vitest.config.ts | grep -A 20 miniflare`
4. **Template file** (if substitution): `cat secrets.json | grep VAR_NAME`
5. **GitHub Secrets**: Repository settings → Secrets → Actions

## Common Mistakes

❌ Adding to root `turbo.json` instead of package-specific
❌ Using `process.env` in Worker code (use `env.VAR_NAME`)
❌ Forgetting to add to `secrets.json` when using template substitution
❌ Not running `env:sync` after Doppler changes
❌ Not running type generation after adding Worker env vars

## Quick Commands

Check which package manager is used (bun/pnpm), then run:

```bash
# Sync to Cloudflare
{bun|pnpm} env:sync           # Production
{bun|pnpm} env:sync:stg       # Staging (if available)

# Regenerate types (if script exists)
{bun|pnpm} types
{bun|pnpm} wrangler:types
{bun|pnpm} codegen


```
