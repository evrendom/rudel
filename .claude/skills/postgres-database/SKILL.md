---
name: postgres-database
description: Postgres (auth/control-plane) database conventions — where the schema and queries live, how to write and run Drizzle migrations, and Drizzle usage patterns. Use whenever touching `packages/sql-schema`, writing or running Postgres migrations, querying Postgres via Drizzle, or wiring new tables into services/handlers.
allowed-tools: [Read, Edit, Write, Grep, Glob, Bash]
---

# Postgres Database — Schema, Migrations, and Queries

This project stores its **auth / control-plane** data (users, organizations, sessions, accounts, API keys, device codes, wrapped resume tokens, etc.) in **Postgres** (Neon in production, local Docker in standalone dev), accessed via **Drizzle ORM** on top of the `postgres` (postgres-js) driver. ClickHouse is a separate data plane for session analytics — use the `chkit` skill for that.

## Where things live

| Concern                                   | Location                                                           |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Schema definition (source of truth)       | `packages/sql-schema/src/*-schema.ts` (re-exported via `index.ts`) |
| Migration SQL files                       | `packages/sql-schema/db/migrations/*.sql`                          |
| Drizzle bookkeeping (snapshots + journal) | `packages/sql-schema/db/migrations/meta/`                          |
| Drizzle config                            | `packages/sql-schema/drizzle.config.ts`                            |
| Migration runner                          | `packages/sql-schema/src/migrate.ts`                               |
| Drizzle + postgres client                 | `apps/api/src/db.ts` (exports `db` and raw `sqlClient`)            |
| Request-level auth middleware             | `apps/api/src/middleware.ts`                                       |
| Feature queries                           | `apps/api/src/services/*.service.ts`                               |
| RPC handler-level queries                 | `apps/api/src/handlers/**/*.ts`                                    |

Schema is split by concern across several files (`auth-schema.ts`, `wrapped-resume-schema.ts`, `wrapped-share-schema.ts`) and re-exported from `packages/sql-schema/src/index.ts`. Always import tables and types from the package entrypoint `@rudel/sql-schema`, never deep-import from `src/*`.

**Rule of thumb for where a query lives:**

- If it's part of a self-contained feature → put it in `apps/api/src/services/<feature>.service.ts`.
- If it's one-off and tightly coupled to a single RPC route → inline in `apps/api/src/handlers/…`.
- Never query Postgres from `apps/web` (frontend) or `apps/cli`.

## Schema = source of truth

`packages/sql-schema/src/*-schema.ts` is the canonical schema. **Always change the schema file first**, then generate a migration. Never hand-edit a migration SQL file to "add a column on the side."

Drizzle-kit maintains three coupled artifacts:

1. `src/*-schema.ts` — desired state
2. `db/migrations/NNNN_<name>.sql` — the incremental SQL applied to Postgres
3. `db/migrations/meta/_journal.json` + `meta/NNNN_snapshot.json` — drizzle-kit's diffing state

If (3) drifts from (1) + (2), future `drizzle:generate` runs produce garbage diffs. See "Recovering from snapshot drift" below.

## Writing migrations

**Never hand-author migration SQL.** Always use drizzle-kit generate — hand-written migrations cause journal drift.

Workflow:

1. Edit the relevant file in `packages/sql-schema/src/*-schema.ts` (or add a new one and re-export it from `src/index.ts`).
2. From the repo root:
   ```bash
   bun --cwd packages/sql-schema run drizzle:generate --name <short_description>
   ```
   e.g. `--name add_user_preferences`. This writes `NNNN_add_user_preferences.sql`, `meta/NNNN_snapshot.json`, and appends to `_journal.json`.
3. Open the generated SQL and sanity-check it (especially column defaults, FK `ON DELETE` behavior, nullability, and index ordering).
4. Run `bun --cwd packages/sql-schema run drizzle:check` — should report no drift.
5. Apply locally: with the Docker Postgres up (`bun run infra:up` from repo root), run `PG_CONNECTION_STRING=postgres://postgres:postgres@localhost:5432/rudel bun --cwd packages/sql-schema run migrate`. Note: `bun run dev:local` also runs migrations on boot.
6. Commit the `.sql`, `meta/NNNN_snapshot.json`, and updated `_journal.json` together in one commit.

## Running migrations

Migrations are applied via **Drizzle's `postgres-js` migrator** (`drizzle-orm/postgres-js/migrator`, see `packages/sql-schema/src/migrate.ts`). Drizzle tracks applied migrations in a `__drizzle_migrations` schema table inside the target Postgres database. The meta snapshots/journal are consumed by `drizzle-kit` at **generate** time, not at runtime.

From `packages/sql-schema`:

- `bun run migrate` — applies against whatever `PG_CONNECTION_STRING` is set (use with the local Docker DB, or wrap in `doppler run` for any environment)
- `bun run migrate:ci` — applies against the CI Postgres (`doppler --config ci`)
- `bun run migrate:prd` — applies against production Neon (`doppler --config prd`)

For local standalone dev, migrations are auto-applied by `bun run dev:local` (see `scripts/dev-local.sh`). Tests run against a disposable container provisioned per suite; migrations are applied by the test harness.

## Official Drizzle / Postgres documentation

For up-to-date Drizzle ORM and drizzle-kit capabilities, use the `library-docs` skill with library `drizzle-orm` or `drizzle-kit`. For Postgres itself, prefer the canonical docs at https://www.postgresql.org/docs/current/.

## Postgres is full-fat — no SQLite-style footguns

Unlike SQLite/D1, Postgres supports:

- Full `ALTER TABLE ... ALTER COLUMN` (type changes, nullability, defaults) without a rebuild. Drizzle-kit emits these directly.
- `RETURNING *` / `RETURNING <cols>` everywhere (use `.returning()` in Drizzle queries).
- Foreign keys with cascades, deferrable constraints, partial indexes, `GIN`/`GIST`, JSONB, arrays, enums, etc.
- Stored procedures and triggers — but keep business logic in the API process; schema-side logic is hard to review and test.
- Transactions across many statements — use `db.transaction(async (tx) => { … })` for multi-statement writes that must be atomic.

Things to still watch for:

- **Destructive migrations cannot be auto-rolled back.** For column renames, drops, or type narrowings against populated tables, prefer dual-write → backfill → cutover across separate migrations.
- **`db.transaction` with `postgres-js`** uses savepoints under the hood; avoid holding transactions open across external I/O.
- **Neon (production) is a serverless Postgres.** Cold connections are possible; the `postgres` driver handles this, but don't assume zero-latency first query. Don't open additional connection pools from Workers/handlers — reuse `db` / `sqlClient` from `apps/api/src/db.ts`.
- **No cross-database joins to ClickHouse.** Postgres and ClickHouse are separate engines — fetch from each and compose in the API layer.

## Query patterns

### Getting a Drizzle handle

The canonical pattern — import the shared `db` from `apps/api/src/db.ts`:

```ts
import { user } from "@rudel/sql-schema";
import { eq } from "drizzle-orm";
import { db } from "../db.js";

export async function getUserById(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row ?? null;
}
```

The Drizzle instance is constructed once in `apps/api/src/db.ts` (`drizzle(client, { schema })`). **Do not call `drizzle(...)` deep inside a service or handler** — import the shared `db`. For queries that need the raw postgres-js client (e.g. ``sqlClient`select ...` `` template literals, `LISTEN`/`NOTIFY`, custom types), import `sqlClient` from the same module — `apps/api/src/services/wrapped-resume.service.ts` is the reference example.

Inside ORPC handlers the same `db` import is used; the `orgMiddleware` / `adminMiddleware` in `apps/api/src/middleware.ts` already perform membership checks, so downstream handlers can assume `context.organizationId` is populated when the middleware is applied.

### Type imports

Always import tables and row types from the package entrypoint:

```ts
import {
  user,
  type UserSelect,
  type UserInsert,
  wrappedResume,
  type WrappedResumeSelect,
} from "@rudel/sql-schema";
```

Do not deep-import from `packages/sql-schema/src/*`. Row types are exported as `<Table>Select` / `<Table>Insert`, derived via `$inferSelect` / `$inferInsert` at the schema file.

### Timestamps

Auth and product tables use `timestamp("…", { withTimezone: true, mode: "date" })`. This means Drizzle hands you `Date` objects on read and expects `Date` on write — serialize with `.toISOString()` when handing values to the API layer, not at the DB layer. Don't introduce `mode: "string"` columns without a clear reason.

### Transactions

```ts
await db.transaction(async (tx) => {
  await tx.insert(invitation).values({ … });
  await tx.update(organization).set({ … }).where(eq(organization.id, orgId));
});
```

Use `tx` inside the callback — never mix the outer `db` handle into a transaction. If the callback throws, postgres-js rolls back automatically.

### Returning rows from writes

Postgres supports `RETURNING`, so prefer `.returning()` over a follow-up `SELECT`:

```ts
const [created] = await db
  .insert(wrappedShare)
  .values({ … })
  .returning();
```

## Recovering from snapshot drift

Symptoms: `meta/_journal.json` has fewer entries than there are `NNNN_*.sql` files on disk, or `drizzle:check` reports drift even though prod and the schema files agree.

The cause is usually that someone hand-wrote a migration SQL file without running `drizzle:generate`.

Fix:

1. Verify each `src/*-schema.ts` file matches the _cumulative_ effect of all existing migration SQL files (read each migration and cross-check columns, defaults, FKs).
2. Run `bun --cwd packages/sql-schema run drizzle:generate --name catchup_snapshots`. This emits a fresh `NNNN_snapshot.json` plus a new `NNNN_catchup_snapshots.sql` containing whatever drizzle thinks is missing.
3. If production already has those tables/columns (almost always the case), replace the generated SQL body with a no-op:
   ```sql
   -- no-op: catchup to realign drizzle-kit snapshots with Postgres migration history.
   -- tables/columns were already created by earlier hand-written migrations.
   SELECT 1;
   ```
4. Commit the new snapshot, journal entry, and no-op SQL together.
5. From now on, always use `drizzle:generate` for schema changes.

## Doing a schema change — quick checklist

- [ ] Edit the relevant file in `packages/sql-schema/src/*-schema.ts` (or add one and re-export from `src/index.ts`)
- [ ] `bun --cwd packages/sql-schema run drizzle:generate --name <desc>`
- [ ] Review generated SQL in `packages/sql-schema/db/migrations/`
- [ ] `bun --cwd packages/sql-schema run drizzle:check`
- [ ] Apply to local Postgres (e.g. via `bun run dev:local` or `bun --cwd packages/sql-schema run migrate` with `PG_CONNECTION_STRING` set)
- [ ] Update consumer code (services, handlers, tests) to use the new columns
- [ ] `bun run verify` from repo root
- [ ] Commit schema changes + SQL + snapshot + journal together
