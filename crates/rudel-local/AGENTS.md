# Rudel Local Scope

This is the one active Rust local engine crate for the MLP.

TypeScript owns drift classification; Rust owns local mechanics.

It owns:

- scan
- path normalization
- git remote normalization
- hash primitives
- lockfile
- write plan
- managed section writes
- git diff
- safe writes

Planned, not implemented:

- local SQLite persistence
- watcher
- persistent undo

Split this crate only when real implementation pressure makes a smaller crate boundary useful.
