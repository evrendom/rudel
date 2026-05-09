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

Do not require ClickHouse env vars for v1.
Do not initialize ClickHouse at startup.
Do not register transcript/session ingestion routes unless explicitly requested.

ClickHouse is future paid session infrastructure only.
