# Repo-wide Rules

## TypeScript Imports

**Never use `.js` extensions in relative TypeScript imports.** Write `from "./auth-schema"`, not `from "./auth-schema.js"`.

The shared base tsconfig uses `moduleResolution: "Bundler"` and every runtime here (Bun, Vite) resolves extensionless relative imports. The `.js` form breaks tools whose loaders can't resolve a `.js` extension against a `.ts` source file — e.g. `drizzle-kit generate` fails silently and leaves migration state corrupt.

Applies to all `.ts` / `.tsx` files across `apps/` and `packages/`.

---

# Walk-In Layout Rules

These instructions apply only to the `apps/web/src/features/walk-in/*` route and supporting files that shape its layout.

This document is intentionally limited to layout. It does not define copy, motion, analytics, or visual tone.

## Scope

- Apply these rules only when editing the walk-in story deck layout.
- Do not treat these rules as global guidance for auth, dashboard, or wrapped routes.

## Core Layout Model

- Design the walk-in route as a full-screen mobile story first.
- Size the route with safe viewport units like `100svh`; do not use `100vh` or `min-h-screen` for the primary walk-in shell.
- Respect safe areas with `env(safe-area-inset-top/right/bottom/left)` padding on the route shell.
- Keep the story as a single focused stage on phone. Do not center a desktop card inside a phone viewport.
- Prefer one screen per step before allowing internal scrolling.
- Keep primary navigation reachable near the bottom safe area on phone-sized layouts.

## Phone Layout

- Use width-based gutters instead of edge-to-edge content.
- Treat `16px` horizontal inset and `12px` vertical inset as the minimum baseline before safe-area adjustments.
- Keep narrative copy in a readable measure; avoid full-width paragraphs.
- Keep all interactive controls at `44px` minimum hit area, including progress indicators.
- If the visible progress marker is smaller than `44px`, wrap it in a larger tap target.
- Avoid splitting essential navigation between distant top and bottom regions unless both areas remain comfortably reachable.

## Tablet Layout

- Treat tablet as `iPadOS`, not as a scaled phone.
- Adapt by available width, not by device name. The layout must still work in split view and other constrained window sizes.
- Allow a richer stage on larger widths, but keep story content centered and readable.
- Do not let long-form text or metric rows stretch across the full tablet width.
- Expand composition only when the container width supports it; collapse cleanly back to a single-column story stage when space narrows.

## Structure Rules

- Keep the walk-in route resilient to narrow, tall, and resized viewports.
- Avoid `overflow: hidden` on the overall route when it would block fallback scrolling for larger text.
- Prefer container-based layout decisions over screen-class assumptions.
- Keep the number of visible page indicators manageable; if the deck grows too long, split it into chapters or reduce visible steps.

## Verification

- Run `bun run lint:walkin:hig` after layout changes.
- End every walk-in layout task by running `bun run lint:walkin:hig`.
- A layout change is not complete until the walk-in route passes the Apple HIG walk-in audit.
