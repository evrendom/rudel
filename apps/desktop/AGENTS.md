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

Do not import from `_archive/web`.

Managed file writes must go through Rust commands and write plans. Do not write local skill files directly from React.
