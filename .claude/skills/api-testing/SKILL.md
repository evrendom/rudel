---
name: api-testing
description: Test the local Rudel API with authenticated requests. Use when the user wants to test API endpoints, debug RPC calls, verify auth flows, or inspect API responses against the local dev server.
metadata:
  author: rudel
  version: "1.1"
compatibility: Requires curl, jq, and a running local API server (bun run dev:local or bun run --cwd apps/api dev).
allowed-tools: Bash(curl:*) Bash(source:*) Bash(mkdir:*) Read
---

# API Testing

Test authenticated requests against the local Rudel API (`http://localhost:4010`).

## Prerequisites

1. The API server must be running locally on port 4010
2. A `.env` file at the project root with test credentials:

```
API_TESTING_USER=user@example.com
API_TESTING_PASSWORD=yourpassword
API_TESTING_ORG=<organization-id>
```

The user must already exist in the database (created via the web UI or sign-up endpoint).

## Authentication

The API uses `better-auth` with cookie-based sessions. Sign in once, save the cookie, and reuse it for all subsequent requests.

### Step 1: Sign in and save the session cookie

```bash
mkdir -p .context && source .env && curl -s -c .context/cookies.txt \
  -X POST http://localhost:4010/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$API_TESTING_USER\", \"password\": \"$API_TESTING_PASSWORD\"}"
```

This saves the `better-auth.session_token` cookie to `.context/cookies.txt` (gitignored).

### Step 2: Set the active organization

The `set-active` endpoint requires an `Origin` header.

```bash
source .env && curl -s -b .context/cookies.txt -c .context/cookies.txt \
  -X POST http://localhost:4010/api/auth/organization/set-active \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4010" \
  -d "{\"organizationId\": \"$API_TESTING_ORG\"}"
```

This sets the org context for all subsequent analytics calls. Use both `-b` and `-c` since this updates the session cookie.

### Step 3: Verify the session works

```bash
curl -s -b .context/cookies.txt \
  -X POST http://localhost:4010/rpc/me \
  -H "Content-Type: application/json" \
  -d "{}" | jq
```

Expected: JSON with `id`, `email`, `name`, `activeOrganizationId` matching your `API_TESTING_ORG`.

## Contracts and Schemas

All endpoint contracts and Zod schemas live in `packages/api-routes/src/`:

- **`packages/api-routes/src/index.ts`** — The full RPC contract. Defines every endpoint with its input/output schemas. Read this to see all available methods and their exact types.
- **`packages/api-routes/src/schemas/analytics.ts`** — All analytics input/output Zod schemas (`DaysInputSchema`, `OverviewKPIsSchema`, `SessionListInputSchema`, etc.). Read this to see exact field names, types, and defaults for any analytics endpoint.
- **`packages/api-routes/src/schemas/source.ts`** — Ingest-related schemas (`IngestSessionInput`, etc.).

To find the exact payload for any endpoint, read the contract in `index.ts` to find which schema it uses, then read that schema definition in `schemas/`.

## Making RPC Calls

The API uses oRPC. All RPC endpoints use `POST /rpc/<method>` with JSON body.

**Important**: Endpoints that take input require the body wrapped in `{"json": {...}}`. Endpoints without input accept `{}`.

### Pattern

```bash
# No input (e.g., me, listMyOrganizations)
curl -s -b .context/cookies.txt \
  -X POST http://localhost:4010/rpc/<method> \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# With input — wrap in {"json": {...}}
curl -s -b .context/cookies.txt \
  -X POST http://localhost:4010/rpc/<method> \
  -H "Content-Type: application/json" \
  -d '{"json": {"days": 30}}' | jq
```

**Responses** are also wrapped: `{"json": {...}}`. Extract data with `jq '.json'`.

### Available Endpoints

**Auth-only endpoints** (require session, no org context):

| Method | Input | Description |
|--------|-------|-------------|
| `me` | `{}` | Get current user info |
| `listMyOrganizations` | `{}` | List user's organizations |
| `ingestSession` | `{"json": IngestSessionInput}` | Upload a session transcript |
| `getOrganizationSessionCount` | `{"json": {"organizationId": "..."}}` | Count sessions for an org |
| `deleteOrganization` | `{"json": {"organizationId": "..."}}` | Delete an org |

**Org-scoped analytics endpoints** (require session + active organization):

| Method | Input | Description |
|--------|-------|-------------|
| `analytics/overview/kpis` | `{"json": {"days": N}}` | Overview KPIs |
| `analytics/overview/usageTrend` | `{"json": {"days": N}}` | Usage trend data |
| `analytics/overview/modelTokensTrend` | `{"json": {"days": N}}` | Model token trends |
| `analytics/overview/insights` | `{"json": {"days": N}}` | Insights |
| `analytics/overview/teamSummaryComparison` | `{"json": {"days": N}}` | Team summary comparison |
| `analytics/overview/successRate` | `{"json": {"days": N}}` | Success rate |
| `analytics/developers/list` | `{"json": {"days": N}}` | List developers |
| `analytics/developers/trends` | `{"json": {"days": N}}` | Developer trends |
| `analytics/projects/investment` | `{"json": {"days": N}}` | Project investment |
| `analytics/projects/trends` | `{"json": {"days": N}}` | Project trends |
| `analytics/sessions/summary` | `{"json": {"days": N}}` | Session summary |
| `analytics/roi/metrics` | `{"json": {"days": N}}` | ROI metrics |
| `analytics/roi/trends` | `{"json": {"days": N}}` | ROI trends |
| `analytics/users/mappings` | `{"json": {"days": N}}` | User mappings |

### Examples

```bash
# List organizations (no input)
curl -s -b .context/cookies.txt \
  -X POST http://localhost:4010/rpc/listMyOrganizations \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.json'

# Get overview KPIs for last 30 days (input wrapped in json)
curl -s -b .context/cookies.txt \
  -X POST http://localhost:4010/rpc/analytics/overview/kpis \
  -H "Content-Type: application/json" \
  -d '{"json": {"days": 30}}' | jq '.json'

# Get usage trend for last 7 days
curl -s -b .context/cookies.txt \
  -X POST http://localhost:4010/rpc/analytics/overview/usageTrend \
  -H "Content-Type: application/json" \
  -d '{"json": {"days": 7}}' | jq '.json'

# Get session count for an org
source .env && curl -s -b .context/cookies.txt \
  -X POST http://localhost:4010/rpc/getOrganizationSessionCount \
  -H "Content-Type: application/json" \
  -d "{\"json\": {\"organizationId\": \"$API_TESTING_ORG\"}}" | jq '.json'
```

## Switching Active Organization

To switch to a different org than `API_TESTING_ORG` mid-session:

```bash
curl -s -b .context/cookies.txt -c .context/cookies.txt \
  -X POST http://localhost:4010/api/auth/organization/set-active \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4010" \
  -d '{"organizationId": "<other-org-id>"}'
```

## Bearer Token Alternative

Instead of cookies, you can extract a bearer token and use `Authorization` headers (this is what the CLI does):

```bash
# Extract token from session
TOKEN=$(curl -s -b .context/cookies.txt http://localhost:4010/api/cli-token | jq -r '.token')

# Use bearer token
curl -s -X POST http://localhost:4010/rpc/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{}" | jq '.json'
```

## API Server Logs

If you set `RUDEL_LOG_DIR` (for example, in `.env`), the API writes logs to a daily file in that directory, resolved from the project root. With `RUDEL_LOG_DIR=.context`, logs are at:

```
.context/api-logs-YYYY-MM-DD.txt
```

For today's date, read `.context/api-logs-$(date +%Y-%m-%d).txt`. The log file contains all API debug-level output (requests, errors, ClickHouse queries, etc.).

**When debugging errors**: After a failing request, read the tail of the log file to see the server-side error, stack trace, or query details. This is especially useful for 500 errors where the curl response is generic.

## Troubleshooting

- **401 Unauthorized**: Cookie expired or missing. Re-run the sign-in step.
- **Input validation failed / BAD_REQUEST**: Check that input is wrapped in `{"json": {...}}`. Endpoints with parameters require this wrapper.
- **MISSING_OR_NULL_ORIGIN on auth endpoints**: Add `-H "Origin: http://localhost:4010"` to better-auth API calls (`/api/auth/*`).
- **BAD_REQUEST on analytics endpoints**: No active organization set. Run step 2 to set the active org.
- **Connection refused**: API server not running. Start it with `bun run dev:local` or `bun run --cwd apps/api dev`.
- **Unexpected 500 or unclear error**: Read the API log file at `.context/api-logs-$(date +%Y-%m-%d).txt` for the server-side stack trace.

## Best Practices

1. **Always sign in first** before making RPC calls. Check if `.context/cookies.txt` exists and is recent; if not, re-authenticate.
2. **Use `jq '.json'`** to unwrap oRPC responses.
3. **Use `-s` (silent)** with curl to suppress progress bars.
4. **Check `me` first** after sign-in to verify the session is valid and see the user's `activeOrganizationId`.
5. **Never log credentials** in command output. Use `source .env` to load them into the shell environment.
