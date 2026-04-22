# PR #223 QA Plan

## Purpose

This PR is the Saturday wrapped growth-loop ship candidate.

The loop under test is:

1. A signed-in user reaches Wrapped.
2. They generate a shareable final card.
3. The product creates a persisted public share record.
4. Another user opens the public replay page.
5. That user sees the replay.
6. They click `Make yours`.
7. They authenticate and land in `/get-started`.
8. If they already have uploaded sessions, they continue normally.
9. If they do not have uploaded sessions and they are on mobile, the product sends them a desktop resume link.
10. The desktop resume link returns them to `/get-started` with the original share attribution.

This plan is intentionally narrow. It is only for the launch-safe Saturday scope.

## What must be true for launch

- Public wrapped replay works anonymously.
- Public replay uses a persisted share snapshot, not private viewer queries.
- `Make yours` preserves `share_id` attribution into `/get-started`.
- The Saturday deck only shows:
  - `upload`
  - `intro`
  - `model`
  - `scale`
  - `pulse`
  - `card`
- These beats remain hidden:
  - `skills`
  - `tools`
  - `lock-in`
  - `quality`
- Mobile users can still view replay, story, and card.
- Mobile users only get handed off to desktop at the upload/setup step.
- Resume links are single-use and expire.
- Final share actions can export the post image.
- `Decimal` remains available as a VIP special-edition card, not a computed archetype.

## Fast way to run this plan

### Static gate

```bash
bun run qa:pr223:static
```

What it covers:
- wrapped Apple HIG audit
- focused wrapped/get-started tests
- focused API safety tests
- repo lint
- repo typecheck
- repo build

### CI parity gate

```bash
bun run qa:pr223:ci
```

What it covers:
- full `verify`
- wrapped Apple HIG audit

Use this before merge. It is the closest local approximation of CI.

### Local API smoke

Prerequisites:
- local API server running on `http://localhost:4010`
- `.env` contains:
  - `API_TESTING_USER`
  - `API_TESTING_PASSWORD`
  - `API_TESTING_ORG`

```bash
bun run qa:pr223:api
```

What it covers:
- sign in and set active org
- create wrapped share
- fetch public wrapped share
- create desktop resume link
- consume desktop resume link
- verify single-use token behavior

## Files under highest QA scrutiny

### Flow control

- `apps/web/src/features/get-started/GetStartedRouteGate.tsx`
- `apps/web/src/features/get-started/DesktopResumePromptPage.tsx`
- `apps/web/src/features/get-started/WrappedDesktopResumePage.tsx`
- `apps/web/src/features/wrapped/PublicWrappedSharePage.tsx`
- `apps/web/src/app/routes.ts`

### Share and export

- `apps/web/src/features/wrapped/team-card/page.tsx`
- `apps/web/src/features/wrapped/team-card/use-share.ts`
- `apps/web/src/features/wrapped/team-card/share.ts`
- `apps/web/src/features/wrapped/team-card/share-snapshot.ts`
- `apps/web/src/features/wrapped/team-card/share-media.ts`
- `apps/web/src/lib/screenshot.ts`

### Backend contract and safety

- `apps/api/src/handlers/wrapped-share.ts`
- `apps/api/src/handlers/wrapped-resume.ts`
- `apps/api/src/services/wrapped-share.service.ts`
- `apps/api/src/services/wrapped-resume.service.ts`
- `apps/api/src/rate-limit.ts`
- `packages/api-routes/src/schemas/wrapped-share.ts`
- `packages/api-routes/src/schemas/wrapped-resume.ts`

### Truth gating

- `apps/web/src/features/wrapped/onboarding/config.ts`
- `apps/web/src/features/wrapped/onboarding/shell.tsx`
- `apps/web/src/features/wrapped/team-card/archetypes.ts`

## Ticket-to-test mapping

### `RUD-91` Saturday wrapped growth loop

Verify:
- public replay loads from real share
- `Make yours` sends user through auth and back to `/get-started`
- reduced Saturday deck appears
- continue path reaches dashboard

### `RUD-92` Cross-device auth handoff

Verify:
- mobile user without uploads sees desktop handoff only at upload/setup
- email link is issued
- desktop resume returns user to `/get-started`

### `RUD-94` Public share link access model

Verify:
- public replay works anonymously
- missing or expired share fails closed
- public page does not require private analytics queries

### `RUD-107` Growth-loop analytics

Verify in browser network/devtools or analytics debug logs:
- `shareCreated`
- `shareViewed`
- `makeYoursClicked`
- `onboardingStartedFromShare`
- `desktopLinkSent`
- `resumeClaimed`

### `RUD-108` Access integrity

Verify:
- resume token is single-use
- resume token expires
- share snapshots have payload versioning
- public share and resume endpoints are rate-limited

### `RUD-103` Final share artifact

Verify:
- `Share post` uses native share when available
- `Copy image` works where clipboard image copy is supported
- `Download PNG` produces a non-empty image file
- third-party avatars do not break export

## Manual browser matrix

### Desktop same-device happy path

1. Sign in with a user eligible for Wrapped.
2. Open `/wrapped`.
3. Move through the Saturday deck.
4. Confirm only these steps appear:
   - `upload`
   - `intro`
   - `model`
   - `scale`
   - `pulse`
   - `card`
5. Confirm `skills`, `tools`, `lock-in`, and `quality` do not appear.
6. Reach the final card.
7. Confirm `Decimal` is present as a VIP option.
8. Generate a share.
9. Open the public share URL in a private window.
10. Confirm the replay loads.
11. Click `Make yours`.
12. Complete auth.
13. Confirm the app lands on `/get-started?share_id=...`.
14. Confirm the user continues into the reduced Wrapped flow or dashboard based on upload state.

### Mobile handoff happy path

1. Open the public share URL on a phone-sized viewport.
2. Confirm the replay is visible.
3. Click `Make yours`.
4. Complete auth on mobile.
5. Confirm `/get-started` loads.
6. For a user without uploaded sessions:
   - confirm the desktop handoff prompt appears
   - confirm upload instructions do not appear directly on mobile
7. Send the desktop link.
8. Open the link on desktop while signed into the same account.
9. Confirm the app returns to `/get-started` with the original `share_id`.

### Resume security checks

1. Use a fresh resume link once.
2. Reuse the same link again.
3. Confirm the second attempt fails.
4. If possible, try the link while signed into another account.
5. Confirm the app rejects the mismatch.

### Export checks

1. On the final card, run:
   - `Share post`
   - `Copy image`
   - `Download PNG`
2. Confirm the exported image matches the card surface.
3. Confirm the export still works when the original row has no avatar.
4. Confirm the export still works when the original row has an unsafe third-party avatar URL.

## Data-truth checks

These are not full blockers for Saturday, but they must be reviewed deliberately:

- The Saturday deck must stay limited to the truth-approved steps.
- Public replay copy must describe the final card as a selected theme, not a computed truth claim.
- `Decimal` must remain a special edition.
- Hidden beats must stay hidden until their data is trustworthy.

## Pass criteria

The PR is ready for launch review when all of these are true:

- `bun run qa:pr223:static` passes
- `bun run qa:pr223:ci` passes
- `bun run qa:pr223:api` passes against a local running API
- desktop same-device happy path passes manually
- mobile handoff happy path passes manually
- export checks pass manually
- analytics events are visible in the expected places

## Failure triage

If something fails, fix only the launch path.

Good fixes:
- wrong redirect
- missing `share_id`
- bad resume token behavior
- hidden steps accidentally visible
- export failure
- public replay regression

Do not expand scope into:
- new hidden beat logic
- classifier work
- extra architecture cleanup unrelated to the launch path
