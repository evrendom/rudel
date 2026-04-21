---
name: repeatable-page-creation
description: Create or refactor a page, screen, or step with a repeatable workflow. Use when the user wants a new Geneva page to be systematic across states, especially onboarding screens, upload steps, walk-in beats, mobile product scenes, or recap surfaces. Sequences story and product intent first, Family-like surface choice second, route layout constraints third, and motion last.
---

# Repeatable Page Creation

Use this skill when the user is:
- creating a new page, step, or scene
- refactoring an existing page to make it more systematic
- asking for a repeatable process for page design and build
- designing stateful mobile screens with loading, ready, error, sparse, or empty variants
- building upload, onboarding, setup, or recap screens

Do not use it for:
- tiny component-only tweaks
- backend-only or data-only work
- pure animation polish after the page is already solved
- route-wide theming with no page-level structure change

## Workflow

1. Inspect the current surface first.
Read the route files, the current data wiring, and the neighboring screens or steps before deciding anything.
Do not invent a fresh page model until you know:
- what already exists
- what persists from the previous or next surface
- which UI primitives are already in use
- which route semantics must stay intact

2. Define the page contract.
Decide the route, protagonist, one job, real states, and the page handoff.
If the screen is a recap beat or story step, use `geneva-wrapped-product` and `personalized-recap-storytelling` now.
Before promising any state or copy, classify the page inputs as:
- `tracked`
- `derivable`
- `missing`
- `placeholder`
Output:
- `page job`
- `state list`
- `state gating`
- `data status`
- `handoff in`
- `handoff out`

3. Establish the trust contract when the page is a recap or analytic beat.
For each meaningful state, define:
- metric basis
- time window
- filters or exclusions
- reference class
- eligibility
Do not skip this on recap pages just because the page is visually simple.

4. Choose the surface model.
Use `family-wallet-design-adaptation` when the page needs a soft product-like surface or continuity from one state to the next.
If the page is not on `wrapped-family`, borrow Family principles deliberately rather than treating that skill's route scope as binding.
Decide:
- one focal object or one focal content block
- what persists from the previous or next screen
- what information should be suppressed
- whether progression belongs inside the focal object
Cut clutter before styling.

5. Lock the layout scaffold.
If the page lives in `apps/web/src/features/walk-in/*`, use `walk-in-layout-hig` now and treat it as binding.
Use a three-zone structure by default:
- top: orientation, progress, or debug
- middle: focal object or narrative block
- bottom: primary actions near the safe area
Keep actions stable. Do not let button count move the main content.
Keep `44px` hit targets and safe-area padding.
Reuse existing route and app primitives unless the layout need clearly forces a local wrapper.

6. Add motion last.
Only after the page job, states, surface, and layout are correct, use `interface-craft` for storyboard animation or DialKit tuning.
Motion rules:
- one focal motion idea per page
- persistent shell stays persistent
- progression belongs inside the middle object before it belongs to the whole page
- do not use motion to compensate for weak hierarchy

7. Verify.
For walk-in layout work, run `bun run lint:walkin:hig`.
For non-trivial implementation, run `bun run check-types --filter=@rudel/web`.
If you substantially change the route structure or styling, inspect the page in the browser before considering it complete.
If the page is a recap or story beat, do one last pass asking whether the beat earns its existence and whether sparse-data states are graceful.

## Default Output Shape

When using this skill, prefer to work in this order:
- `Current surface`: route files, data wiring, neighboring handoff
- `Page contract`: route, protagonist, one job
- `Data status`: tracked, derivable, missing, placeholder
- `State table`: loading, ready, ready-with-issues, empty, sparse, and fallback states
- `Trust contract`: only required for recap or analytic beats
- `Surface choice`: focal object, continuity, and what is intentionally omitted
- `Layout scaffold`: top, middle, bottom
- `Copy hierarchy`: one strong line, one quiet line, one small tag if needed
- `Motion boundary`: what moves and what stays still
- `Implementation map`: files to edit
- `Verification`: route-specific checks

## Rules

- Start with states, not visuals.
- Inspect the existing route before inventing a new surface model.
- One screen should answer one primary question.
- Mark every important input as tracked, derivable, missing, or placeholder.
- Use recap or Spotify logic to decide why the page exists, not how it looks.
- Use Family to choose the surface attitude and continuity model, not to add decoration.
- Outside `wrapped-family`, use Family as a reference system, not a route-scoped commandment.
- Use HIG to constrain structure and reachability, not to write copy.
- Keep the most expressive progression inside the middle object.
- Say the active verb once; do not repeat `Uploading`, `Loading`, or `Processing` in three places.
- If the page becomes dense, split it into states or steps instead of stacking more info.
- Preserve route semantics and reuse existing primitives before creating new wrappers.
- Prefer deletion over ornament.

## Adjacent Skills

Use these at the stage where they matter:
- `geneva-wrapped-product` and `personalized-recap-storytelling`: after inspection, to define the beat, data status, job, and trust contract
- `family-wallet-design-adaptation`: after the product contract, to choose the surface model and continuity
- `walk-in-layout-hig`: during layout and again at the end for walk-in pages
- `interface-craft`: last, for animation and tuning
