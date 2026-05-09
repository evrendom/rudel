# Skill Compiler Scope

This package owns deterministic generation from blueprint + modules + repo overlay + agent target to generated artifacts.

Compiler output should be pure and repeatable:

- generated content
- target path
- content hash
- warnings when needed

Return generated artifacts here. Rust write plans own local file safety.
