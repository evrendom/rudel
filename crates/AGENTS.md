# Rust Crates Scope

Rust owns local authority.

Rust responsibilities:

- folder permissions
- scanning
- file watching
- lockfile reads/writes
- hashing
- drift detection
- install/update write plans
- atomic writes
- undo records
- git status/diff

Do not move product semantics, visual editor logic, or skill compiler semantics into Rust unless explicitly requested.

TypeScript decides what generated artifacts should be produced. Rust decides whether and how they are safely written.
