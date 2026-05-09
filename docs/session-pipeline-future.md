# Session Pipeline Later

ClickHouse session infrastructure stays in the repo as parked paid infrastructure.

For v1:

- ClickHouse code may remain present
- Keep ClickHouse runtime outside the default path
- Keep ClickHouse env vars optional
- Route new MLP work through `apps/desktop-tauri`, `packages/desktop-ui`, API, skill schema, skill compiler, and `crates/rudel-local`
- Keep ClickHouse tests/scripts outside default MLP verification

Keep the session infrastructure simple until it returns to scope: ClickHouse code present, ClickHouse runtime parked.

Future re-enable path:

1. Add ClickHouse env validation.
2. Initialize the ClickHouse client.
3. Register transcript ingest routes.
4. Add bundled upload helper.
5. Add ClickHouse tests to paid-pipeline CI.
6. Add paid session intelligence UI.
