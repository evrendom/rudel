# API Scope

The API supports the private Skill Blueprint product.

Active v1 API domains:

- auth
- teams
- skill blueprints
- skill modules
- repo overlays
- install records
- team sync

Keep ClickHouse env vars optional for v1.
Keep ClickHouse startup outside the default API path.
Register Skill Blueprint routes before transcript/session ingestion routes.

ClickHouse is future paid session infrastructure only.
