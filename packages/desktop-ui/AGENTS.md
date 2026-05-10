# Desktop UI Scope

This package owns Rudel's product UI and product UI state.

TypeScript owns drift classification; Rust owns local mechanics.

## UI Component Rule

Use shadcn components as the only component source for product UI.

Do not introduce non-shadcn UI component libraries or bespoke reusable UI components. If a needed component does not exist yet, add or adapt it through the shadcn component layer first.

Plain semantic HTML is allowed only for structural wrappers, text, and one-off layout glue.

Current UI owns:

- repo gallery
- scan-root selection
- repository overview grouping and presentation
- local scan status

Later UI hydration owns:

- blueprint library
- blueprint editor
- repo x agent matrix
- drift inbox
- slug inference
- blueprint matching
- inventory grouping
- drift classification
- lockfile entry creation from generated artifacts
- write planner
- diff preview
- local/team sync status

Shell-specific code stays in `apps/desktop-tauri`. Local machine authority stays behind the `LocalEngine` port.

Product UI receives local functions through props/context and routes managed filesystem work through that port.
