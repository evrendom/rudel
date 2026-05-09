# Rust Scope

`crates/rudel-local` owns local authority for the MLP.

TypeScript owns drift classification; Rust owns local mechanics.

Rust responsibilities:

- folder permissions
- scanning
- file watching
- lockfile reads/writes
- hashing
- safe write plans
- atomic writes
- undo records
- git status/diff
- local SQLite

Keep product semantics, grouping, matching, drift classification, visual editor logic, and skill compiler semantics in TypeScript unless a specific task moves that boundary.

TypeScript decides what generated artifacts should be produced. Rust decides whether and how they are safely written.

Keep this as one crate until implementation pressure makes a smaller boundary useful.
