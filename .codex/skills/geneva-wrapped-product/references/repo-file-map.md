# Repo File Map

These are the key recap files in Geneva.

## Routes And Scenes

- `apps/web/src/features/wrapped/FifaWrappedPage.tsx`
  Current broad wrapped presentation.

- `apps/web/src/features/wrapped/use-fifa-wrapped-data.ts`
  Main recap mapper with many story-ready fields.

- `apps/web/src/features/wrapped-family/WrappedFamilyPage.tsx`
  Wrapped-family route shell.

- `apps/web/src/features/wrapped-family/useWrappedFamilySpendData.ts`
  Spend-focused wrapped-family data source.

- `apps/web/src/features/wrapped-family/WrappedFamilySpendScene.tsx`
  Spend scene and visual storytelling.

- `apps/web/src/features/walk-in/team-card-walk-in-onboarding.tsx`
  Walk-in beat deck and recap specification text.

- `apps/web/src/features/walk-in/TeamCardWalkInPage.tsx`
  Walk-in route wiring and metric handoff.

## Schemas

- `packages/api-routes/src/schemas/analytics.ts`
  WrappedV1 and broader analytics schemas.

- `packages/ch-schema/src/db/schema/session-analytics.ts`
  Session-derived fields used for recap signals.

- `packages/sql-schema/src/auth-schema.ts`
  Auth schema. Notably missing timezone and locale fields.

## Related Rule

If you edit walk-in layout behavior, end with:
- `bun run lint:walkin:hig`
