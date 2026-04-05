---
name: react-effects-rules
description: Use when reviewing or refactoring React effect usage in this repo, deciding whether logic should be render-derived, event-driven, mount-only via useMountEffect, or an explicit imperative bridge exception.
---

# React effects rules

This repo is strict about direct `useEffect` usage in app-owned code.

Read the full rule doc here:

- `/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/react-effects-rules.md`

## Use this skill when

- reviewing React code for effect overuse
- refactoring components that synchronize state with effects
- deciding whether a new effect belongs in app-owned code
- checking whether a mount-only bridge should use `useMountEffect`

## Core rule

In app-owned code:

- prefer render derivation
- prefer event handlers for interaction logic
- use `useMountEffect` for true mount-only imperative setup
- use direct `useEffect` only for documented imperative bridges

## Important exception

Do not fork preset-managed primitives just to eliminate upstream effects.

Current explicit example:

- `/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/app/ui/calendar.tsx`

That file is preset-managed and its focus effect is a legitimate DOM bridge.

## Default decision rule

- If the logic can be derived during render, do that.
- If the logic is triggered by a user action, move it into the handler.
- If it only needs to run on mount, use `useMountEffect`.
- If it is a real imperative bridge, keep it explicit and documented.
