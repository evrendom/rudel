# Current Surfaces

Geneva currently has three recap-adjacent surfaces with different maturity levels.

## Fifa Wrapped

Files:
- `apps/web/src/features/wrapped/FifaWrappedPage.tsx`
- `apps/web/src/features/wrapped/use-fifa-wrapped-data.ts`

This is the broadest current recap surface.
It already maps many live analytics fields into a story payload and exposes the strongest base for a production-grade multi-beat recap.

## Wrapped Family

Files:
- `apps/web/src/features/wrapped-family/WrappedFamilyPage.tsx`
- `apps/web/src/features/wrapped-family/useWrappedFamilySpendData.ts`
- `apps/web/src/features/wrapped-family/WrappedFamilySpendScene.tsx`

This is a narrower, spend-centric scene.
It feels more like a polished single-scene flex than a complete wrapped system.

## Walk-In

Files:
- `apps/web/src/features/walk-in/team-card-walk-in-onboarding.tsx`
- `apps/web/src/features/walk-in/TeamCardWalkInPage.tsx`

This is the clearest story-spec deck.
It already defines beats such as `model`, `evolution`, `lock-in`, `archetype`, `skills`, `quality`, `tools`, and `project`, but some beats still depend on fields that are not yet fully exposed or persisted.

## Practical Reading

- Use `Fifa Wrapped` when you need the richest current payload.
- Use `Wrapped Family` when you need one memorable emotional scene.
- Use `Walk-In` when you are planning or revising the story system itself.
