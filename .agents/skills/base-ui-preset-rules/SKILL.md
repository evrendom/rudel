---
name: base-ui-preset-rules
description: Use when working on UI architecture in this repo, deciding whether a change belongs in the shadcn Base UI preset-managed layer or a local custom island, syncing the current preset baseline, or adding new custom components on top of preset primitives.
---

# Base UI preset rules

This repo uses a shadcn **Base UI** preset as the replaceable baseline for generic UI.

Current baseline:

- preset code: `b1VlJAwL`
- sync command: `pnpm run preset:sync`
- rule doc: `/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/base-ui-preset-rules.md`

## Use this skill when

- changing generic UI architecture
- deciding whether to edit a preset-managed primitive or build a local component
- updating the preset code
- syncing the preset baseline
- reviewing whether a new UI should be generic or product-specific

## Core rule

Keep the baseline replaceable.

- generic UI belongs in the preset-managed layer
- product-specific taste belongs in explicit local islands
- new custom components should compose preset primitives instead of forking them

## Preset-managed

May be overwritten by `pnpm run preset:sync`:

- `components.json`
- `src/index.css`
- generic `src/app/ui/*` primitives except `src/app/ui/sidebar.tsx`

Do not hand-tune these for one-off product needs.

## Custom-owned

Stay local:

- sidebar
- shell chrome
- shell header typography override
- dashboard metric row
- dashboard insights cards
- team cards
- Nivo chart

Read the rule doc for the exact file list and workflow:

- `/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/base-ui-preset-rules.md`

## Default decision rule

- If the change should affect generic UI everywhere, update the preset baseline.
- If the change is product-specific, build or update a local island.
- If you need a special component, compose from preset primitives first.

## Workflow

### Change the baseline

1. Update the preset on the shadcn site if needed.
2. Change `presetCode` in `apps/web/shadcn-preset.json` if needed.
3. Run `pnpm run preset:sync` in `apps/web`.
4. Review:
   - `/__preset-baseline`
   - `/dashboard`
   - `/team`
   - `/settings`

### Add a custom component

1. Build it in the relevant feature folder.
2. Compose from preset primitives.
3. Keep differentiated styling local.
4. Avoid editing preset-managed primitives unless the change belongs everywhere.
