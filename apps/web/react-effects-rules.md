# React effects rules

This repo is strict about direct `useEffect` usage in app-owned code.

The goal is to keep React state flow simple enough that design work can move fast without adding hidden synchronization logic.

## Core rule

In app-owned code, direct `useEffect` is not the default tool.

Preferred order:

1. derive state during render
2. move interaction logic into event handlers
3. use library hooks for subscriptions and data sources
4. use `useMountEffect` only for true mount-only imperative setup
5. use direct `useEffect` only for documented imperative bridges that cannot be expressed otherwise

## Allowed direct `useEffect` cases

### 1. `useMountEffect` implementation

This is the one centralized mount-only wrapper:

- [useMountEffect.ts](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/hooks/useMountEffect.ts)

### 2. Preset-managed primitives that intentionally stay upstream-like

Current explicit exception:

- [calendar.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/app/ui/calendar.tsx)

The effect there is an imperative focus bridge for keyboard navigation. Do not fork preset-managed primitives just to eliminate upstream effect usage.

### 3. Rare app-owned imperative bridges

If an app-owned file genuinely needs direct `useEffect`:

- keep it rare
- add a Biome suppression comment
- include a one-line reason

## Disallowed patterns

Avoid these in app-owned code:

- syncing state from state with an effect
- moving event logic into an effect
- using `useEffect` for values that can be derived during render
- adding direct `useEffect` because it feels familiar

## Examples from this repo

### Allowed mount-only bridge

- [main.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/main.tsx)

The body class bridge belongs in `useMountEffect`, not a raw `useEffect`.

### Disallowed redundant sync

- [DashboardDateControls.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/features/dashboard/components/DashboardDateControls.tsx)

Draft reset should happen in `onOpenChange`, not through a second synchronization effect.

### Allowed preset-managed imperative bridge

- [calendar.tsx](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/src/app/ui/calendar.tsx)

That focus sync is legitimate DOM behavior inside a preset-managed primitive.

## Enforcement

`biome.json` restricts importing `useEffect` from `react` in app-owned `apps/web/src` code.

The restriction does not apply to:

- `src/app/ui/**`
- `src/hooks/useMountEffect.ts`

This keeps the default strict while preserving upstream-synced primitives.

## Relationship to preset ownership

Read this together with:

- [base-ui-preset-rules.md](/Users/evrendombak/conductor/workspaces/rudel/kathmandu-v2/apps/web/base-ui-preset-rules.md)

Ownership split:

- preset-managed primitives stay close to upstream
- app-owned product code follows the stricter React rule
- custom components should compose preset primitives instead of patching them
