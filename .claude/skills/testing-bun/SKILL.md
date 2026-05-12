---
name: testing-bun
description: CRITICAL - Invoke BEFORE writing ANY test code. Use when creating new tests, adding test cases, modifying existing tests, writing `it()` or `describe()` blocks, or touching any `*.test.ts` or `*.spec.ts` file. Enforces no try-catch in positive tests, no early returns, no test skipping.
allowed-tools: [Read, Edit, Grep, Glob, Bash]
---

# Testing Standards (Bun)

## Framework
- Use `bun:test` imports (`describe`, `test`, `expect`, etc.)
- Use Bun test runner, typically via workspace scripts (`bun run test`)
- Do not introduce Vitest or Jest in this repo
- For local e2e/integration runs that need env vars, use Doppler (`bun run test:env`)

## Test Strategy
- **Default to API integration tests against real infrastructure** (real Postgres, real ClickHouse). Call a real endpoint, let data flow through the API into the DB, then verify by calling another endpoint. This is "e2e" from the API perspective only — frontend is out of scope here.
- **Never mock services, DB clients, or external APIs.** If a test would need a mock, write the integration test instead.
- **Unit tests are reserved for pure logical utilities** (parsers, formatters, pure functions). A service that "needs" a unit test is a smell — prefer the integration path above.

## Critical Rules

### 1. No Try/Catch in Positive Tests
```ts
// Bad - Hides real errors
test('creates user', async () => {
  try {
    const user = await createUser(input)
    expect(user.id).toBeDefined()
  } catch (error) {
    console.error(error)
  }
})

// Good - Let test framework handle errors
test('creates user', async () => {
  const user = await createUser(input)
  expect(user.id).toBeDefined()
})

// Good - Only for testing expected failures
test('rejects invalid input', async () => {
  await expect(createUser(invalid)).rejects.toThrow('Invalid email')
})
```

### 2. No Early Returns in Tests
```ts
// Bad - Silently skips test
test('calls API', async () => {
  if (!hasCredentials) return
  await callApi()
})

// Good - Fail when preconditions missing
test('calls API', async () => {
  expect(hasCredentials).toBe(true)
  await callApi()
})
```

### 3. No Hidden Skips for Missing Env Vars
```ts
// Bad
describe.skipIf(!process.env.CLICKHOUSE_URL)('integration', () => {})

// Bad
if (!process.env.CLICKHOUSE_URL) {
  test.skip('requires CLICKHOUSE_URL', () => {})
}

// Good - Let tests fail if env not configured
describe('integration', () => {
  const url = process.env.CLICKHOUSE_URL
  expect(url).toBeTruthy()
})
```

### 4. E2E Policy (Mandatory)
- E2E tests must never be conditional on env availability
- Never use `skip`, `skipIf`, guard `return`, or branching that bypasses e2e execution when env vars are absent
- Missing required env vars must cause test failure immediately
- Local e2e execution must use Doppler so required vars are injected

```bash
# Required local command for env-dependent suites
bun run test:env
```

### 5. Prefer Inline Setup Over `beforeEach`
```ts
// Bad - Unnecessary beforeEach
describe('Tests', () => {
  let queryBuilder: QueryBuilder
  beforeEach(() => {
    queryBuilder = new QueryBuilder(schema)
  })
})

// Good - Inline initialization
describe('Tests', () => {
  const queryBuilder = new QueryBuilder(schema)
})

// Good - Use beforeEach only for async cleanup
beforeEach(async () => {
  await client.query('DELETE FROM test_table')
})
```

## Best Practices

### Use assert() for Type Narrowing
```ts
// Good - Provides type narrowing
assert(checkoutRecord)
```

### Keep Tests Deterministic and Isolated
- Prefer plain `test(...)` blocks with explicit setup
- Use package-level scripts (`bun test src`) for focused runs when needed

## Environment Variables
When adding new env vars for tests, update:
1. Package's `turbo.json` → `passThroughEnv` array
2. `.github/workflows/ci.yml` → `env` section
3. Run local e2e/integration suites with `bun run test:env`
4. Treat missing vars as a hard failure, not a skip path
