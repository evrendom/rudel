# Wrapped Design Guardrails

This file exists to keep the design PR aligned with the product we are actually
shipping.

Use it when changing anything under `apps/web/src/features/wrapped/*`.

This is not a generic design manifesto. It is a branch guardrail for the
current Wrapped work.

## Purpose

The goal of this branch is to make Wrapped feel stronger, clearer, and more
shareable without changing the underlying product contract.

The job is:

- improve the story feel
- improve the final card and post surface
- improve readability, emotional payoff, and desirability
- keep the user moving toward the final card and sharing

The job is not:

- invent a different Wrapped product
- silently change the meaning of the data
- turn the final card into a fake classifier truth claim
- drift away from the current share loop

## Current Product Frame

The current Wrapped product on this branch is:

- a recap story deck
- a final card picker
- a post preview
- a share/export surface

The user flow we are protecting is:

1. User enters Wrapped.
2. User moves through the story beats.
3. User lands on the final card.
4. User picks the card they would post.
5. User sees the exact exported post preview.
6. User shares or downloads it.
7. User can continue to the dashboard.

Design work should make this loop feel better, not longer, more confusing, or
more abstract.

## Non-Negotiable Product Truths

These are not design opinions. They are product constraints.

- The user is the protagonist. The product is the stagehand.
- The final card is currently a selected theme, not a computed identity truth.
- The public share should faithfully reflect the final post surface.
- The final card and the exported post are the reward. Do not bury them.
- Sharing must stay straightforward.
- The wrapped story should still feel like a story, not a dashboard.

## Archetype Rules

The active taxonomy source is [docs/archetype-taxonomy.md](/Users/evrendombak/conductor/workspaces/rudel/geneva/docs/archetype-taxonomy.md).

Do not invent new archetypes on this branch.

Do not reintroduce retired labels on this branch.

Current product-facing labels in this branch are:

- `Smooth Operator`
- `Company Card`
- `Obsessed`

Those are the names that should be used in:

- product UI
- design reviews
- share surfaces
- exported assets
- product copy

Internal taxonomy keys may still exist in data references, but the wrapped
branch should use the product-facing names above in its design work and local
implementation.

`Decimal` is special:

- `Decimal` is a special edition card
- `Decimal` is for VIP users
- `Decimal` is not a classifier-backed archetype
- `Decimal` must not be framed as discovered truth

If copy or design treatment makes `Decimal` feel like a computed result, that is
wrong.

## Story Beat Rules

Every visible beat needs one clear job.

Good beats:

- introduce a new lens
- feel emotionally legible at a glance
- keep momentum toward the final card

Bad beats:

- restate the same idea twice
- feel like internal analytics dressed up as product
- require careful reading to understand the point

When in doubt:

- simplify the beat
- cut visual noise
- keep one dominant message per screen

## Final Card Rules

The final card is the emotional payoff of the run.

That means:

- the card should feel desirable enough to post
- the card should remain easy to scan
- the card should look intentional at export size
- the selected theme should feel expressive, not random

Do not make the card feel like:

- a settings form
- a dense dashboard
- a crypto wallet clone
- a lore-heavy personality test result

The current truth is still:

- user picks the card they want
- the system does not yet claim to know the one true archetype

The design can make selection feel premium. It cannot imply classifier certainty.

## Share And Export Rules

The post preview is not decorative. It is operational.

It must stay:

- readable when exported
- visually stable enough to screenshot or render
- obviously close to the final shared artifact

Do not add design complexity that makes export worse:

- tiny low-contrast type
- fragile overlays
- details that only work live but collapse in PNG form
- compositions that depend on hidden hover states

If a visual idea looks good in-app but would make the exported post worse, do
not use it.

The designer may later customize the post system more deeply. This branch should
not block that. It should keep the export surface clean and dependable.

## What Design Is Allowed To Change

These are safe to change on this branch:

- typography
- spacing
- composition
- visual hierarchy
- color direction
- motion and transitions
- illustration or texture treatment
- card chrome
- post-preview presentation
- how the card picker feels

These are also safe to change if they improve clarity:

- button emphasis
- page pacing
- the emotional tone of surfaces
- how premium or playful the final card feels

## What Design Must Not Redefine

Do not change these without explicit product signoff:

- route structure
- auth or share flow logic
- which metrics mean what
- the difference between selected theme and computed archetype
- `Decimal` special-edition status
- the active archetype taxonomy
- share/export being part of the core loop

If a change requires a different data contract, it is no longer just design.

## Files That Anchor The Truth

Use these files as the product anchors before making a design decision:

- [apps/web/src/features/wrapped/onboarding/config.ts](/Users/evrendombak/conductor/workspaces/rudel/geneva/apps/web/src/features/wrapped/onboarding/config.ts)
- [apps/web/src/features/wrapped/team-card/page.tsx](/Users/evrendombak/conductor/workspaces/rudel/geneva/apps/web/src/features/wrapped/team-card/page.tsx)
- [apps/web/src/features/wrapped/team-card/final-stages.tsx](/Users/evrendombak/conductor/workspaces/rudel/geneva/apps/web/src/features/wrapped/team-card/final-stages.tsx)
- [docs/archetype-taxonomy.md](/Users/evrendombak/conductor/workspaces/rudel/geneva/docs/archetype-taxonomy.md)

If the visual work starts fighting those truths, stop and resolve the product
question first.

## Review Checklist

Before considering a Wrapped design change done, check:

- Is the user still clearly the protagonist?
- Does each beat still have one obvious message?
- Does the flow still build toward the final card?
- Does the final card still feel like the reward?
- Does the selected card still read as a chosen theme, not fake truth?
- Does `Decimal` still read as a VIP special edition?
- Would the exported post still look strong and legible?
- Did this make the story better without changing the product contract?

If any answer is no, the change is drifting.
