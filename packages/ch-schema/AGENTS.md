# ClickHouse Schema Scope

This package is parked future infrastructure for paid session ingestion and analytics.

Keep it in the repo.

Wire it into runtime code when paid session ingestion returns to scope.

For v1:

- keep ClickHouse env vars optional
- keep ClickHouse startup outside the default API path
- keep ClickHouse tests outside default MLP verification
- route transcript ingestion work to later paid session infrastructure

When session ingestion is re-enabled later, this package should be used for ClickHouse schema, migrations, generated types, and analytics tables.
