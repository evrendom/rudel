# Skill Schema Scope

This package owns the shared TypeScript/Zod domain model for Skill Blueprints.

TypeScript owns drift classification; Rust owns local mechanics.

Keep blueprint, module, overlay, target, installation, lockfile, drift, and write-plan shapes here so desktop, API, and compiler code share one type source.

Put rendering, local filesystem writes, and API transport concerns in their owning packages.
