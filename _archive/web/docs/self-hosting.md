# Self-Hosting Rudel

This guide walks through deploying Rudel using **ObsessionDB** (ClickHouse), **Neon** (Postgres), and **Fly.io** (app server). This is the same stack we use in production.

> **This is an opinionated guide.** Rudel is a Bun server that needs Postgres and ClickHouse — it can run anywhere those are available. You don't have to use these specific providers. Any Postgres instance, any ClickHouse instance (that supports `SharedReplacingMergeTree` or `ReplacingMergeTree`), and any platform that can run a Bun/Node.js server will work. We use ObsessionDB, Neon, and Fly.io because they all have free tiers and are easy to set up.

## Services

| Component | Provider | Free Tier | Purpose |
|-----------|----------|-----------|---------|
| **ClickHouse** | [ObsessionDB](https://obsessiondb.com) | Yes | Session transcript storage and analytics |
| **Postgres** | [Neon](https://neon.tech) | Yes (0.5 GB) | Authentication (users, sessions, accounts) |
| **App Server** | [Fly.io](https://fly.io) | Yes (3 shared VMs) | HTTP API + static frontend serving |

## 1. Provision ClickHouse (ObsessionDB)

1. Create an account at [obsessiondb.com](https://obsessiondb.com)
2. Create a new ClickHouse instance
3. Note your connection details:
   - **Host** — the HTTPS endpoint (e.g. `https://your-instance.obsessiondb.com`)
   - **Username** — your username
   - **Password** — your password
4. Apply the schema migration:

```bash
# From the repo root — set the env vars that chkit reads
CLICKHOUSE_URL=https://your-instance.obsessiondb.com \
CLICKHOUSE_USER=your-username \
CLICKHOUSE_PASSWORD=your-password \
CLICKHOUSE_DB=default \
  bun --bun --cwd packages/ch-schema chkit migrate --apply
```

The migration creates the `rudel` database, the `claude_sessions` and `session_analytics` tables, and a materialized view that computes analytics on insert. The cloud migration uses `SharedReplacingMergeTree` for `claude_sessions`.

> **Note**: `CLICKHOUSE_DB` must be set to `default` for the migration because the `rudel` database doesn't exist yet — the migration creates it. `CLICKHOUSE_USER` (not `CLICKHOUSE_USERNAME`) is the env var name that the migration tool expects.

## 2. Provision Postgres (Neon)

1. Create an account at [neon.tech](https://neon.tech)
2. Create a new project and database named `rudel`
3. Copy your connection string (looks like `postgres://user:pass@host/rudel?sslmode=require`)
4. Run the Drizzle migrations:

```bash
PG_CONNECTION_STRING="postgres://user:pass@host/rudel?sslmode=require" \
  bun run --cwd packages/sql-schema migrate
```

This creates the auth tables (users, sessions, accounts, verification tokens) used by `better-auth`.

## 3. Deploy to Fly.io

1. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Sign up or log in: `fly auth login`
3. Create a new app:

```bash
fly launch --name your-app-name --no-deploy
```

4. Set secrets (the API reads `CLICKHOUSE_USERNAME`, not `CLICKHOUSE_USER`):

```bash
fly secrets set \
  PG_CONNECTION_STRING="postgres://user:pass@host/rudel?sslmode=require" \
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  CLICKHOUSE_URL="https://your-instance.obsessiondb.com" \
  CLICKHOUSE_USERNAME="your-username" \
  CLICKHOUSE_PASSWORD="your-password" \
  APP_URL="https://your-app-name.fly.dev" \
  ALLOWED_ORIGIN="https://your-app-name.fly.dev"
```

5. Deploy (the `Dockerfile` in the repo root handles building the frontend and running the API):

```bash
fly deploy
```

6. Verify it's running:

```bash
curl https://your-app-name.fly.dev/health
```

### Custom domain

If you want to use a custom domain instead of `*.fly.dev`:

```bash
fly certs add your-domain.com
```

Then update `APP_URL` and `ALLOWED_ORIGIN` to match:

```bash
fly secrets set \
  APP_URL="https://your-domain.com" \
  ALLOWED_ORIGIN="https://your-domain.com"
```

## Social Login (Optional)

To enable GitHub or Google OAuth login, create OAuth apps with the respective providers and set the client credentials:

```bash
fly secrets set \
  GITHUB_CLIENT_ID="your-client-id" \
  GITHUB_CLIENT_SECRET="your-client-secret"
```

Set the OAuth callback URL to `https://your-domain.com/api/auth/callback/github` (or `/google`).

Without these, users can still sign up and log in with email/password.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PG_CONNECTION_STRING` | Yes | Postgres connection string |
| `BETTER_AUTH_SECRET` | Yes | Auth secret (`openssl rand -base64 32`) |
| `CLICKHOUSE_URL` | Yes | ClickHouse HTTPS endpoint |
| `CLICKHOUSE_USERNAME` | Yes | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | Yes | ClickHouse password |
| `APP_URL` | Yes | Public URL of the deployed app |
| `ALLOWED_ORIGIN` | Yes | CORS origin (same as `APP_URL` for single-domain) |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth client secret |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
