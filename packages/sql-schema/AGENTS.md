# SQL Schema Scope

This package owns Postgres schema for the Skill Blueprint cloud API.

Active v1 tables should support users, organizations, memberships, teams, skill blueprints, blueprint versions, skill modules, repo overlays, repo registry, and team install records.

Keep ClickHouse schema in `packages/ch-schema`. Local SQLite persistence is planned but not implemented.
