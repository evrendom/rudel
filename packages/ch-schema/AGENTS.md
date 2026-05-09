# ClickHouse Schema Scope

This package is dormant future infrastructure for paid session ingestion and analytics.

Keep it in the repo.

Do not wire it into the v1 Skill Blueprint MLP unless explicitly asked.

For v1:

- do not require ClickHouse env vars
- do not initialize ClickHouse at API startup
- do not include ClickHouse tests in default verification
- do not register transcript ingestion routes

When session ingestion is re-enabled later, this package should be used for ClickHouse schema, migrations, generated types, and analytics tables.
