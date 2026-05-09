# Session Pipeline Future

ClickHouse session infrastructure stays in the repo, but it is not part of the v1 Skill Blueprint MLP.

For v1:

- ClickHouse code may remain present
- ClickHouse runtime must be unreachable by default
- ClickHouse env vars are not required
- ClickHouse routes should not be active for new MLP work
- ClickHouse tests/scripts are not part of default MLP verification

Do not add an `AnalyticsSink`, `NullAnalyticsSink`, fake feature-flagged pipeline, or new session-events package now.

Future re-enable path:

1. Add ClickHouse env validation.
2. Initialize the ClickHouse client.
3. Register transcript ingest routes.
4. Add bundled upload helper.
5. Add ClickHouse tests to paid-pipeline CI.
6. Add paid session intelligence UI.
