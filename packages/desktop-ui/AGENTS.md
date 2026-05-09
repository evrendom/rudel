# Desktop UI Scope

This package owns Rudel's product UI and product UI state.

TypeScript owns drift classification; Rust owns local mechanics.

It owns:

- blueprint library
- blueprint editor
- repo x agent matrix
- drift inbox
- write planner
- diff preview
- local/team sync status

Shell-specific code stays in `apps/desktop-tauri`. Local machine authority stays behind the `LocalEngine` port.

Product UI receives local functions through props/context and routes managed filesystem work through that port.
