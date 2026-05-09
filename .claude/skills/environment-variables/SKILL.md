---
name: environment-variables
description: Environment variable management patterns. CRITICAL use when adding new environment variables (secrets, API keys, config), debugging "X not defined" or missing env var errors, tests passing locally but failing in CI, Turborepo not passing env vars to tasks, or troubleshooting deployment configuration errors.
allowed-tools: [Read, Edit, Grep, Glob, Bash]
---

# Environment Variables Management

## Source of Truth: Doppler

All environment variables are stored in Doppler. Never hardcode secrets or commit them to git.

## Four Integration Points

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

### 3. Client `VITE_*` Variables

Client variables prefixed with `VITE_` are baked into the app at build time by Vite. They must be present in the CI job that runs the build:

```yaml
jobs:
  verify:
    env:
      VITE_ADMIN_ORGANIZATION_ID: ${{ secrets.VITE_ADMIN_ORGANIZATION_ID }}
```

If the value is missing from the build environment, Vite will bake an empty value into the app.

### 4. Package-Specific turbo.json

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

## Checklist: Adding New Environment Variable

- [ ] Add to Doppler for all environments
- [ ] Add to GitHub Secrets (if used in CI)
- [ ] Add to `.github/workflows/ci.yml` (if used in CI)
- [ ] If `VITE_*`: Add it to the CI job that runs the Vite build
- [ ] Add to package-specific `turbo.json` → `passThroughEnv`
- [ ] Validate tests pass locally and in CI

## Debugging Missing Env Vars

Check in order:

1. **Doppler**: `doppler secrets get VAR_NAME`
2. **Package turbo.json**: `cat packages/your-package/turbo.json | grep -A 10 passThroughEnv`
3. **GitHub Secrets**: Repository settings → Secrets → Actions

## Common Mistakes

❌ Adding to root `turbo.json` instead of package-specific
❌ Adding a `VITE_*` var to local Doppler only and forgetting the CI build job
