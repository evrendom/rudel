---
name: geneva-wrapped-product
description: Apply recap storytelling inside Geneva. Use when editing `apps/web/src/features/wrapped*`, `apps/web/src/features/wrapped-family/*`, or recap-related parts of `apps/web/src/features/walk-in/*`, and when mapping Geneva analytics to Wrapped beats, fallbacks, and share surfaces. Pair with `personalized-recap-storytelling` for non-trivial recap design work.
---

# Geneva Wrapped Product

Use this skill when a recap decision needs to be grounded in Geneva's actual surfaces and analytics.

Apply it when the user is:
- choosing the primary wrapped surface in this repo
- mapping analytics to candidate beats
- deciding tracked vs derivable vs missing recap data
- editing story copy or sequencing on `walk-in`, `wrapped`, or `wrapped-family`
- planning a new wrapped payload or schema
- evaluating whether a Geneva recap idea is real or wishful thinking

Do not use it for:
- unrelated app analytics work
- pure visual restyling with no recap or storytelling change
- generic recap frameworks that are not specific to Geneva

## Workflow

1. Start with `references/current-surfaces.md` and `references/repo-file-map.md`.
Decide which route is being treated as the primary recap surface and which routes are still exploratory.

2. Check `references/analytics-map.md` and `references/tracked-vs-missing.md`.
Do this before promising any beat, comparison, or share card.

3. Use `references/candidate-beats.md`.
Pick the cards most likely to work with current Geneva data instead of inventing placeholder beats.

4. Use `references/share-surface-options.md`.
Choose the share artifact and the route that should host it.

5. Pair with adjacent skills when needed.
- Use `$personalized-recap-storytelling` for the generic recap system.
- Use `walk-in-layout-hig` when changing walk-in layout behavior.
- Use `family-wallet-design-adaptation` when changing `wrapped-family` visual language.

## Default Output Shape

When using this skill, prefer to answer in this order:
- `Surface choice`: which Geneva route should carry the work
- `Candidate beats`: which cards are strongest with current data
- `Data status`: tracked, derivable, or missing
- `Implementation map`: files to edit
- `Risks`: what still needs schema or product changes

## Rules

- Prefer extending existing recap routes before inventing new one-off surfaces.
- Separate `tracked`, `derivable`, and `missing` every time.
- Do not imply persisted onboarding or archetypes if they are inferred at render time.
- Timezone-sensitive stories require timezone data.
- Favor the richer wrapped mapper before duplicating analytics logic elsewhere.
- Be explicit about whether a route is a full recap, a single-scene flex, or a story-spec deck.

## References

Start with these:
- `references/current-surfaces.md`
- `references/analytics-map.md`
- `references/tracked-vs-missing.md`

Open these when relevant:
- `references/candidate-beats.md` for likely story cards
- `references/share-surface-options.md` for choosing the main route and share artifact
- `references/repo-file-map.md` for concrete files and neighboring constraints
