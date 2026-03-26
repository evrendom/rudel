---
date: "2026-03-26 05:08:58"
sha: "f343f36"
category: "wrong-pattern"
status: pending
observed-workflows:
  subagents: ["Explore"]
  skills: ["compound:feedback"]
  commands: []
---

# Used Vite define instead of VITE_ prefix for shared env var

## Observation

The agent added a `__ADMIN_ORGANIZATION_ID__` global via `define` in `vite.config.ts` and a corresponding `declare const` in `vite-env.d.ts`, when the simpler approach was to use a `VITE_` prefixed env var (`VITE_ADMIN_ORGANIZATION_ID`) which Vite auto-exposes via `import.meta.env` with zero config changes. The user asked: why did you think the vite.config.ts changes were necessary?

## Context

The user initially had two env vars (`ADMIN_ORGANIZATION_ID` for API, `VITE_ADMIN_ORGANIZATION_ID` for web) and asked to consolidate to one. The agent chose to keep the non-prefixed `ADMIN_ORGANIZATION_ID` and inject it into the frontend via `define` in vite.config.ts, rather than using `VITE_ADMIN_ORGANIZATION_ID` everywhere (which Vite auto-exposes and the API can also read from `process.env`).

## Analysis

The agent's reasoning was flawed in two ways:

1. **Assumed `VITE_` prefix only works client-side**: The agent believed using a `VITE_` prefixed env var for the API would be unusual or wrong. In reality, `VITE_` is just a naming convention — `process.env.VITE_ADMIN_ORGANIZATION_ID` works fine in Node/Bun. The prefix is only special to Vite's build-time env exposure.

2. **Over-engineered the solution**: The agent saw the existing `define` pattern for `__APP_VERSION__` in vite.config.ts and assumed that was the way to share env vars. But `__APP_VERSION__` uses `define` because it's computed dynamically (from GitHub API / git tags), not from a simple env var. For plain env vars, the `VITE_` auto-exposure is the correct, zero-config approach.

3. **Missed the caching implication**: Values injected via `define` are baked into the JS bundle at build time. If CI builds without the env var set, Turbo would cache that build with an empty string, and subsequent deploys would serve the stale value. Using `VITE_` env vars has the same build-time nature, but at least doesn't require custom config that's easy to forget about.

The root cause is a wrong-pattern issue: the agent reached for a more complex mechanism (`define` + `declare const`) when the framework already provides the simpler, idiomatic solution (`VITE_` prefix auto-exposure).
