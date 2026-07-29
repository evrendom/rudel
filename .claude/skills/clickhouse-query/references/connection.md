# Connection

The repository wrapper accepts connection details only from the current process:

| Variable | Purpose |
|---|---|
| `CLICKHOUSE_URL` | HTTP(S) endpoint without credentials |
| `CLICKHOUSE_USERNAME` | Database identity |
| `CLICKHOUSE_PASSWORD` | Password |
| `CLICKHOUSE_DB` | Optional default database |

It derives the host, port, secure mode, and chcli username. The wrapper does not
select a target or privilege level; those remain the caller's responsibility.

Remote connections must provide a username. Production queries require an
independently configured read-only identity; do not fall back to application,
migration, write, or administrative credentials.

If direct HTTP diagnostics are necessary outside this skill, send credentials
with `X-ClickHouse-User` and `X-ClickHouse-Key` headers, never in the URL.
