---
date: "2026-03-26 05:20:05"
sha: "f343f36"
category: "missing-check"
status: pending
observed-workflows:
  subagents: ["Explore"]
  skills: ["compound:feedback"]
  commands: []
---

# Failed to add new VITE_ env var to CI workflow

## Observation

Two distinct issues:

1. A new `VITE_ADMIN_ORGANIZATION_ID` env var was added but not propagated to `.github/workflows/ci.yml`. The deploy job passes `VITE_*` vars as `--build-arg` to `flyctl deploy` — the new var needs to be added there too, or the production build won't have it.

2. The `environment-variables` skill is listed as available and explicitly says "CRITICAL use when adding new environment variables" — but it was never invoked during this conversation despite adding a new env var. The skill likely contains guidance about updating CI workflows when adding env vars, which would have caught this.

## Context

Building admin panel for Rudel (NUM-6934). After consolidating to a single `VITE_ADMIN_ORGANIZATION_ID` env var, the agent updated Doppler, the API middleware, and the frontend code — but did not check or update the CI/CD workflow file that passes VITE_ variables as build args to the Fly.io deployment.

## Analysis

This is a `missing-check` issue. When adding a new environment variable — especially one with the `VITE_` prefix that needs to be available at build time — the agent should have:

1. Loaded the `environment-variables` skill, which is marked as CRITICAL for this exact scenario
2. Checked `.github/workflows/ci.yml` to see how existing `VITE_*` vars are handled
3. Added the new var to the deploy job's `--build-arg` list

The CI workflow has a clear pattern: all `VITE_*` vars are passed as `--build-arg` flags to `flyctl deploy`. The agent never inspected this file despite adding a build-time env var. The environment-variables skill exists precisely to prevent this class of oversight.
