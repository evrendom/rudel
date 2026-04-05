# Base UI preset rules

This app uses a shadcn **Base UI** preset as the replaceable baseline for generic UI.

Current baseline:

- preset code: `b1VlJAwL`
- sync command: `pnpm run preset:sync`
- config: [shadcn-preset.json](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/shadcn-preset.json)

## First principles

The baseline should come from the preset, not from hand-tuned local approximations.

That means:

- generic primitives, tokens, and generic surfaces should stay preset-managed
- product-specific taste should live in explicit local islands
- new custom UI should compose the preset layer instead of forking it

This is optimized for shipping fast while keeping the design system replaceable.

## Ownership split

### Preset-managed

These files may be overwritten by `pnpm run preset:sync`:

- `components.json`
- `src/index.css`
- generic `src/app/ui/*` primitives except `src/app/ui/sidebar.tsx`

Treat these as generated baseline files.

### Custom-owned

These files stay local and should not be overwritten by preset sync:

- `src/app/app-surface.css`
- `src/app/preset-extensions.css`
- `src/app/ui/sidebar.tsx`
- `src/features/shell/AppShellLayout.tsx`
- `src/features/shell/components/AppSidebar.tsx`
- `src/features/shell/components/SiteHeader.tsx`
- `src/features/dashboard/components/DashboardPerformancePanel.tsx`
- `src/features/dashboard/components/DashboardPerformanceChart.tsx`
- `src/features/dashboard/components/DashboardInsightsPanel.tsx`
- `src/features/team/components/TeamRosterGallery.tsx`
- `src/features/team/components/TeamPlayerCard.tsx`

These are the current custom product islands.

## What goes where

### If the change should affect generic UI everywhere

Use the preset-managed layer.

Examples:

- button tone
- card shape
- generic dialog/popover/dropdown look
- form field spacing
- default typography for generic UI

Preferred path:

1. update the preset on the shadcn site if needed
2. update `presetCode` in `shadcn-preset.json` if the preset changed
3. run `pnpm run preset:sync`
4. review `/__preset-baseline`

### If the change is product-specific

Keep it local.

Examples:

- sidebar chrome
- dashboard metric selector row
- dashboard insights cards
- team cards
- shell framing/noise

Preferred path:

1. compose from preset primitives when useful
2. apply local classes/tokens in feature files or `app-surface.css`
3. do not patch the generated primitive unless the change is truly system-wide

### If you need a new custom component

Build it as a local component on top of preset primitives.

Good pattern:

- feature component imports `Card`, `Button`, `Badge`, `Tabs`, etc.
- local classes or local CSS tokens define the differentiated look

Bad pattern:

- editing `src/app/ui/button.tsx` because one product surface needs a special style
- editing `src/app/ui/card.tsx` because one dashboard section wants a custom shadow

## Typography rule

The generic body/UI baseline follows the preset.

- generic UI/body: Inter
- explicit header/headline surfaces: `Nunito`

Important:

- do not globally replace all titles with `Nunito`
- use the rounded font only where intentionally opted in

Current explicit example:

- [SiteHeader.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/shell/components/SiteHeader.tsx)

## Practical workflow

### Change the preset baseline

1. update the preset on the shadcn site
2. update `presetCode` in [shadcn-preset.json](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/shadcn-preset.json) if needed
3. run `pnpm run preset:sync` in `apps/web`
4. review:
   - [/__preset-baseline](/__preset-baseline)
   - [/dashboard](/dashboard)
   - [/team](/team)
   - [/settings](/settings)

### Add a product-specific component

1. create the component in the relevant feature folder
2. compose from preset primitives first
3. add local tokens/classes only for what needs to be unique
4. avoid changing preset-managed primitives unless the change belongs everywhere

## Anti-patterns

Avoid these:

- hand-tuning preset-managed primitives for one screen
- putting dashboard/team-specific styling into generic primitives
- letting shell CSS redefine the generic semantic token layer
- using raw one-off values when a semantic token or preset primitive already exists
- treating a custom product surface as evidence that the baseline should be forked

## Current architecture in this repo

### Preset baseline

- [shadcn-preset.json](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/shadcn-preset.json)
- [sync-preset.mjs](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/scripts/sync-preset.mjs)
- [index.css](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/index.css)
- [src/app/ui](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/app/ui)

### Local custom islands

- [AppShellLayout.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/shell/AppShellLayout.tsx)
- [AppSidebar.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/shell/components/AppSidebar.tsx)
- [DashboardPerformancePanel.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/dashboard/components/DashboardPerformancePanel.tsx)
- [DashboardInsightsPanel.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/dashboard/components/DashboardInsightsPanel.tsx)
- [TeamRosterGallery.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/team/components/TeamRosterGallery.tsx)
- [TeamPlayerCard.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/team/components/TeamPlayerCard.tsx)

## Rule of thumb

If the desired result is:

- "the whole app should feel different" -> change the preset baseline
- "this product surface should feel special" -> build a local island
- "I only need one fancy component" -> compose it locally on top of preset primitives

Default to preserving the replaceable baseline.

## Related React rule

Generic preset ownership and React effect ownership are separate rules.

When building app-owned custom components:

- follow [react-effects-rules.md](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/react-effects-rules.md)
- do not patch preset-managed primitives like [calendar.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/app/ui/calendar.tsx) just to satisfy app-owned cleanup preferences
