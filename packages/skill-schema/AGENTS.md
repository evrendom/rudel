# Skill Schema Scope

This package owns the shared TypeScript/Zod domain model for Skill Blueprints.

Keep blueprint, module, overlay, target, installation, lockfile, drift, and install-plan shapes here so desktop, API, and compiler code do not duplicate type definitions.

Do not put rendering, local filesystem writes, or API transport concerns in this package.
