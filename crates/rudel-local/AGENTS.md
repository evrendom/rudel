# Rudel Local Scope

This is the one active Rust local engine crate for the MLP.

TypeScript owns drift classification; Rust owns local mechanics.

It owns:

- scan
- watch
- hash
- lockfile
- write plan
- git diff
- SQLite
- safe writes
- undo

Split this crate only when real implementation pressure makes a smaller crate boundary useful.
