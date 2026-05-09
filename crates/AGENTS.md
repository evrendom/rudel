# Rust Scope

`crates/rudel-local` owns local authority for the MLP.

TypeScript owns drift classification; Rust owns local mechanics.

Rust responsibilities:

- folder permissions
- scan
- path normalization
- git remote normalization
- lockfile reads/writes
- hash primitives
- safe write plans
- managed section writes
- atomic writes
- git diff

Planned, not implemented:

- local SQLite persistence
- watcher
- persistent undo

Keep product semantics, grouping, matching, drift classification, visual editor logic, and skill compiler semantics in TypeScript unless a specific task moves that boundary.

TypeScript decides what generated artifacts should be produced. Rust decides whether and how they are safely written.

Keep this as one crate until implementation pressure makes a smaller boundary useful.
