# Desktop App Scope

This app is the primary product UX.

The desktop app owns:

- blueprint library
- blueprint editor
- repo x agent matrix
- drift inbox
- install/update planner
- diff preview
- local/team sync status

Use active packages and desktop components for product code.

Managed file writes must go through Rust commands and write plans. React asks Rust to scan, plan, write, and undo.
