---
name: family-wallet-design-adaptation
description: Adapt the Geneva `wrapped-family` experience toward the visual and interaction language of the Family wallet references bundled with this skill. Use when editing `apps/web/src/features/wrapped-family/*`, reworking Family-inspired onboarding or wallet scenes, translating the Family design principles into this repo, or replacing the current wrapped-family aesthetic with a softer, simpler, more fluid Family-like direction.
---

# Family Wallet Design Adaptation

Use this skill only when working on the `wrapped-family` surface and closely related files.

This skill is for adapting the design language, not for generic frontend work.

## Workflow

1. Inspect the current `wrapped-family` route files first.
2. Read the design references before changing code.
3. Adapt the route toward Family's principles of simplicity, fluidity, and delight.
4. Preserve the repo's technical stack and existing route/data wiring.
5. Keep the adaptation coherent across layout, typography, color, affordances, and interaction structure.

## Topic Files

Start by reading:

- [references/01-principles-and-simplicity.md](references/01-principles-and-simplicity.md)
- [references/04-reference-screens-and-repo-mapping.md](references/04-reference-screens-and-repo-mapping.md)

Then load only the topic files that match the task:

- For tray architecture, contextual surfaces, and when to use compact flows:
  - [references/02-trays-and-fluidity.md](references/02-trays-and-fluidity.md)
- For transitions, shared elements, continuity, and anti-teleport behavior:
  - [references/02-trays-and-fluidity.md](references/02-trays-and-fluidity.md)
- For colors, shapes, typography, whitespace, and CTA treatment:
  - [references/03-delight-and-visual-language.md](references/03-delight-and-visual-language.md)

## Scope

Start with these files:

- `apps/web/src/features/wrapped-family/WrappedFamilyPage.tsx`
- `apps/web/src/features/wrapped-family/WrappedFamilySpendScene.tsx`
- `apps/web/src/features/wrapped-family/wrapped-family.css`
- `apps/web/src/features/wrapped-family/useWrappedFamilySpendData.ts`

Use this skill for:

- redesigning the `wrapped-family` route
- Family-inspired wallet onboarding or wallet-ready screens
- simplifying or softening the current visual language
- changing typography, spacing, card treatment, CTA hierarchy, step progress, or scene structure
- replacing the current dark flight-board framing with a Family-like mobile product feel

Do not use this skill for:

- unrelated `walk-in` tasks
- generic Apple HIG work
- dashboard-wide theming
- low-level analytics changes without UI adaptation

## Rules

- Prioritize simplicity first. Remove clutter before adding style.
- Prefer one primary action or one primary message per screen.
- Keep the interface welcoming and soft, not technical or aggressive.
- Use fluid transitions to preserve context, not motion for spectacle.
- Prefer contextual panels, trays, cards, and stepped reveals over exposing every control at once.
- Keep typography bold and friendly at the headline level, but calm and readable everywhere else.
- Favor bright, approachable palettes, rounded geometry, and generous whitespace where the Family references call for it.
- Keep CTAs obvious and pill-like when the reference direction supports it.
- Avoid the current "dark airline board" tone unless explicitly asked to keep it.
- Preserve existing data wiring and route semantics unless the user asks for a product change.

## References

Reference images are bundled here:

- `assets/family-reference-01-start.png`
- `assets/family-reference-02-ready.png`
- `assets/family-reference-03-email.png`
- `assets/family-reference-04-code.png`

## Verification

- Run `bun run check-types --filter=@rudel/web` after non-trivial changes.
- If you substantially change the route structure or styling, inspect the `wrapped-family` route in the browser before considering the task complete.
