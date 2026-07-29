---
name: clickhouse-query
description: Run bounded, read-only ClickHouse queries through the repository wrapper.
metadata:
  author: rudel
  version: "2.0"
compatibility: Requires Bun and a reachable ClickHouse instance.
allowed-tools: Bash(bun run --cwd packages/ch-schema chcli --:*) Read Write
---

# ClickHouse Query

Use one command:

```bash
bun run --cwd packages/ch-schema chcli -- -F json -q "<SQL>"
```

The wrapper reads `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, and
`CLICKHOUSE_PASSWORD` from the current process. The URL must not contain
credentials. See [references/connection.md](references/connection.md).

## Guardrails

- Run only read-only queries. Never run DDL, inserts, mutations, deletes, or
  administrative commands.
- Local and staging use their configured identities. Production requires a
  separate least-privilege, read-only identity; stop if it is unavailable.
- Never print or persist credentials or production-derived result data.
- Use `-F json` by default; use `-F jsonl` only for bounded streaming output.

Per ClickHouse's
[`agent-query-safety`](https://github.com/ClickHouse/agent-skills/blob/main/skills/clickhouse-best-practices/rules/agent-query-safety.md)
rule, every application-data query must have:

- a filter on a discovered sorting or partition key;
- a finite `LIMIT`;
- `max_execution_time`;
- `max_rows_to_read` or `max_bytes_to_read`.

`LIMIT` does not cap scanned rows. Metadata queries must also have a finite
`LIMIT`, a time limit, and a read limit.

## Workflow

Per ClickHouse's
[`agent-discovery-schema`](https://github.com/ClickHouse/agent-skills/blob/main/skills/clickhouse-best-practices/rules/agent-discovery-schema.md)
rule, run these steps in order. Execute every SQL block with the wrapper command
above and structured output.

### 1. Databases

```sql
SELECT name
FROM system.databases
WHERE name NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
ORDER BY name
LIMIT 100
SETTINGS max_execution_time = 10, max_rows_to_read = 100000
```

### 2. Tables and active-part sizes

Replace `analytics` with the selected database.

```sql
SELECT
  t.name,
  t.engine,
  coalesce(sumIf(p.rows, p.active), 0) AS rows,
  formatReadableSize(coalesce(sumIf(p.bytes_on_disk, p.active), 0)) AS size
FROM system.tables AS t
LEFT JOIN system.parts AS p
  ON p.database = t.database AND p.table = t.name
WHERE t.database = 'analytics'
GROUP BY t.name, t.engine
ORDER BY sumIf(p.bytes_on_disk, p.active) DESC
LIMIT 200
SETTINGS max_execution_time = 15, max_rows_to_read = 1000000
```

### 3. Columns and comments

```sql
SELECT position, name, type, default_expression, comment
FROM system.columns
WHERE database = 'analytics' AND table = 'events'
ORDER BY position
LIMIT 500
SETTINGS max_execution_time = 10, max_rows_to_read = 100000
```

### 4. Sorting and partition keys

```sql
SELECT sorting_key, primary_key, partition_key
FROM system.tables
WHERE database = 'analytics' AND name = 'events'
LIMIT 1
SETTINGS max_execution_time = 10, max_rows_to_read = 100000
```

### 5. Skipping indexes

```sql
SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'analytics' AND table = 'events'
ORDER BY name
LIMIT 100
SETTINGS max_execution_time = 10, max_rows_to_read = 100000
```

### 6. Bounded sample

Use fields discovered in steps 3–4. This example assumes `event_date` is a key:

```sql
SELECT event_date, user_id, event_type
FROM analytics.events
WHERE event_date >= today() - 1
LIMIT 10
SETTINGS max_execution_time = 30,
         max_rows_to_read = 10000000,
         timeout_before_checking_execution_speed = 0
```

### 7. Explain, then execute

Explain the exact bounded query:

```sql
EXPLAIN indexes = 1
SELECT event_type, count() AS events
FROM analytics.events
WHERE event_date >= today() - 1
GROUP BY event_type
ORDER BY events DESC
LIMIT 100
SETTINGS max_execution_time = 30,
         max_rows_to_read = 10000000,
         timeout_before_checking_execution_speed = 0
```

If the plan shows useful part or granule pruning, run the same query without
`EXPLAIN`. Otherwise narrow the key filter. On timeout, read-limit, or memory
errors, narrow the query rather than increasing limits.
