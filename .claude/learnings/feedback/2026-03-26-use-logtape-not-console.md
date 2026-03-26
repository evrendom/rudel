---
date: "2026-03-26 04:48:44"
sha: "f343f36"
category: "wrong-pattern"
status: pending
observed-workflows:
  subagents: ["Explore"]
  skills: []
  commands: []
---

# Used console.log instead of logtape logger for log statements

## Observation

Implemented log statements with console.log instead of the logtape library which is being used for logging in rudel.

## Context

Building the admin panel with delete user functionality (NUM-6934). When creating the admin handler in `apps/api/src/handlers/admin/index.ts`, the agent used `console.log` for the deletion audit log statement. The existing codebase uses logtape (`@logtape/logtape`) for structured logging — see `apps/api/src/index.ts` which imports `getLogger` and `withContext` from `@logtape/logtape`, and the existing `deleteOrganization` handler in `apps/api/src/router.ts` also uses `console.log` (so both patterns exist, but logtape is the intended standard).

## Analysis

The agent observed `console.log` usage in `apps/api/src/router.ts` (the `deleteOrganization` handler) and replicated that pattern in the new admin handler. However, the project has logtape set up as the structured logging solution (imported in `apps/api/src/index.ts`). The agent should have identified logtape as the canonical logging approach and used `getLogger` instead of `console.log`. This is a wrong-pattern issue — the agent copied a nearby example without checking if it was the recommended pattern.
