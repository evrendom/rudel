---
name: chkit
description: ClickHouse schema management with chkit. Use when working with chkit CLI commands, ClickHouse table/view/materialized view definitions, migration generation, drift detection, or clickhouse.config.ts files. Trigger on chkit commands, @chkit/core imports, or schema definition tasks.
allowed-tools: [Read, Edit, Grep, Glob, Bash]
---

# chkit — ClickHouse Schema & Migration Toolkit

chkit lets you define ClickHouse schemas in TypeScript, generate migrations automatically, detect drift, and run CI checks from a single CLI.

Docs: https://chkit.obsessiondb.com

## Configuration

All chkit projects have a `clickhouse.config.ts` at the project root:

```ts
import { defineConfig } from '@chkit/core'

export default defineConfig({
  schema: './src/db/schema/**/*.ts',    // Glob to schema files
  outDir: './chkit',                     // Artifact root
  migrationsDir: './chkit/migrations',   // SQL migration files
  metaDir: './chkit/meta',               // snapshot.json, journal.json
  plugins: [],                           // Plugin registrations
  clickhouse: {
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    username: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
    database: process.env.CLICKHOUSE_DB ?? 'default',
  },
  check: {
    failOnPending: true,
    failOnChecksumMismatch: true,
    failOnDrift: true,
  },
  safety: {
    allowDestructive: false,
  },
})
```

## Schema DSL

Schema files are TypeScript files that export definitions using functions from `@chkit/core`.

### Tables

```ts
import { schema, table } from '@chkit/core'

const events = table({
  database: 'default',
  name: 'events',
  columns: [
    { name: 'id', type: 'UInt64' },
    { name: 'org_id', type: 'String' },
    { name: 'source', type: 'LowCardinality(String)' },
    { name: 'payload', type: 'String', nullable: true },
    { name: 'received_at', type: 'DateTime64(3)', default: 'fn:now64(3)' },
    { name: 'status', type: 'String', default: 'pending', comment: 'Processing status' },
  ],
  engine: 'MergeTree()',
  primaryKey: ['id'],
  orderBy: ['org_id', 'received_at', 'id'],
  partitionBy: 'toYYYYMM(received_at)',
  ttl: 'received_at + INTERVAL 90 DAY',
  settings: { index_granularity: 8192 },
  indexes: [
    { name: 'idx_source', expression: 'source', type: 'set', granularity: 1 },
  ],
})

export default schema(events)
```

Required table fields: `database`, `name`, `columns`, `engine`, `primaryKey`, `orderBy`.
Optional: `partitionBy`, `uniqueKey`, `ttl`, `settings`, `indexes`, `projections`, `comment`, `renamedFrom`.

### Column defaults

- String values are single-quoted: `default: 'pending'` → `DEFAULT 'pending'`
- Numbers are literal: `default: 0` → `DEFAULT 0`
- Function calls use `fn:` prefix: `default: 'fn:now64(3)'` → `DEFAULT now64(3)`

### Views

```ts
import { view } from '@chkit/core'

const activeUsers = view({
  database: 'app',
  name: 'active_users',
  as: 'SELECT id, email FROM app.users WHERE active = 1',
})
```

### Materialized views

```ts
import { materializedView } from '@chkit/core'

const eventCounts = materializedView({
  database: 'analytics',
  name: 'event_counts_mv',
  to: { database: 'analytics', name: 'event_counts' },
  as: 'SELECT org_id, count() AS total FROM analytics.events GROUP BY org_id',
})
```

### Exporting

Use `schema()` to group definitions, or export individually (any export with a valid `kind` is discovered):

```ts
export default schema(users, events, eventCounts)
// or
export const users = table({ ... })
export const events = table({ ... })
```

## CLI Commands

All commands support `--json` for machine-readable output and `--config <path>` for custom config files.

### init — Scaffold project

```sh
chkit init
```

Creates `clickhouse.config.ts` and `src/db/schema/example.ts`.

### generate — Create migrations

```sh
chkit generate --name add-users-table
chkit generate --dryrun                        # Preview without writing
chkit generate --table analytics.events        # Scope to specific table
chkit generate --rename-table old.users=new.accounts
chkit generate --rename-column db.table.old=new
```

Diffs schema definitions against the last snapshot. Each operation gets a risk level:
- **safe**: `CREATE TABLE`, `ADD COLUMN`
- **caution**: settings changes
- **danger**: `DROP TABLE`, `DROP COLUMN`

### migrate — Apply migrations

```sh
chkit migrate                  # Preview pending
chkit migrate --apply          # Apply all pending
chkit migrate --apply --allow-destructive   # Allow danger operations
chkit migrate --apply --table analytics.events
```

Verifies checksums before applying. Destructive operations require explicit `--allow-destructive` in CI.

### status — Migration state

```sh
chkit status
# Output: Migrations: 5 total, 3 applied, 2 pending
```

Read-only, no ClickHouse connection needed.

### drift — Compare live vs expected

```sh
chkit drift
chkit drift --table analytics.events
```

Compares snapshot against live ClickHouse. Reports missing/extra objects and column-level differences.

### check — CI gate

```sh
chkit check              # Run all policy checks
chkit check --strict     # Force all policies on
chkit check --json       # Machine-readable output
```

Evaluates: pending migrations, checksum mismatches, schema drift, plugin checks. Exit code 1 on failure.

## Rename Workflow

To rename a table or column without drop+recreate:

**Table rename** — set `renamedFrom` on the table:
```ts
const accounts = table({
  database: 'app',
  name: 'accounts',           // new name
  renamedFrom: { name: 'users' },  // old name
  // ... columns, engine, etc.
})
```

**Column rename** — set `renamedFrom` on the column:
```ts
columns: [
  { name: 'user_email', type: 'String', renamedFrom: 'email' },
]
```

CLI flags override schema metadata: `--rename-table old=new`, `--rename-column db.table.old=new`.

## Plugins

Register plugins in `clickhouse.config.ts`:

```ts
import { codegen } from '@chkit/plugin-codegen'

export default defineConfig({
  plugins: [
    codegen({ outFile: './src/generated/chkit-types.ts', emitZod: true }),
  ],
})
```

### Available plugins

| Plugin | Install | Command | Purpose |
|--------|---------|---------|---------|
| `@chkit/plugin-codegen` | `bun add -d @chkit/plugin-codegen` | `chkit codegen` | Generate TypeScript types + Zod schemas |
| `@chkit/plugin-pull` | `bun add -d @chkit/plugin-pull` | `chkit pull` | Introspect live ClickHouse into schema files |
| `@chkit/plugin-backfill` | `bun add -d @chkit/plugin-backfill` | `chkit backfill` | Time-windowed data backfill with checkpoints |

## Common Workflows

### New project

```sh
bun add -d chkit
bunx chkit init
# Edit src/db/schema/example.ts with your tables
bunx chkit generate --name init
bunx chkit migrate --apply
```

### Add a table

1. Create a new schema file in `src/db/schema/`
2. Define the table using `table()` and export via `schema()`
3. Run `chkit generate --name add-my-table`
4. Run `chkit migrate --apply`

### CI pipeline

```sh
chkit check --strict --json
# Fails if: pending migrations, checksum mismatches, schema drift, or plugin errors
```

## Structural vs Alterable Properties

When a property changes, chkit determines whether ALTER or DROP+CREATE is needed:

- **Structural** (requires drop+recreate): `engine`, `primaryKey`, `orderBy`, `partitionBy`, `uniqueKey`
- **Alterable** (ALTER in place): columns, indexes, projections, settings, TTL, comment

Views and materialized views always use drop+recreate.

## Documentation

Full documentation is at https://chkit.obsessiondb.com. The site supports content negotiation — request any page with `Accept: text/markdown` to receive raw source markdown instead of HTML. Fetch docs for details not covered in this skill file.

```sh
curl -s -H "Accept: text/markdown" <url>
```

### Key pages

| Page | URL | Use when |
|------|-----|----------|
| Schema DSL Reference | `https://chkit.obsessiondb.com/schema/dsl-reference/` | Full field specs, column types, validation rules |
| Configuration | `https://chkit.obsessiondb.com/configuration/overview/` | All config options and defaults |
| Codegen Plugin | `https://chkit.obsessiondb.com/plugins/codegen/` | TypeScript types, Zod schemas, ingest functions |
| Pull Plugin | `https://chkit.obsessiondb.com/plugins/pull/` | Introspecting live ClickHouse into schema files |
| Backfill Plugin | `https://chkit.obsessiondb.com/plugins/backfill/` | Time-windowed data backfill with checkpoints |
| CI/CD Integration | `https://chkit.obsessiondb.com/guides/ci-cd/` | Pipeline setup, check commands, deployment |

### Discover all pages

Fetch the index to find CLI command pages and any other documentation:

```sh
curl -s -H "Accept: text/markdown" https://chkit.obsessiondb.com/
```
