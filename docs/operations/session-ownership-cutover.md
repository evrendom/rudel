# Session ownership cutover and cleanup

This is the finite runbook for RUD-215 and RUD-213. It is not a recurring
maintenance process.

Do not record transcript content, organization IDs, session IDs, or user IDs in
the ticket. The commands below print aggregate counts only.

## Migration incident finding

The failed production deploys on 2026-07-23 replayed
`0012_yc_review_sessions` even though the `yc_review` column already existed.
The immediate cause is established: the schema was ahead of the latest
`created_at` value in `drizzle.__drizzle_migrations`.

Drizzle 0.45.1 decides what to run from only the newest migration timestamp. It
does not compare the existing schema or validate every prior journal entry
before replaying later SQL. The repository and retained Actions logs do not
distinguish whether the older watermark came from a restore/fork, a production
connection target change, or manual intervention. Do not claim one of those as
the initiating cause without provider audit evidence.

`packages/sql-schema/src/migrate.ts` now fails before migration when an
ownership artifact exists without its corresponding journal timestamp. After
migration, it verifies that entries 0012 through 0016 are present. This turns a
future schema-ahead watermark into an explicit drift failure before the
non-idempotent `0014_session_ownership` migration is replayed.

## RUD-215: final catch-up

The preview and execution must use the same cutoff. Both ClickHouse reads have a
90-second execution limit and a 10 GB read limit.

1. Run a counts-only preview:

   ```bash
   bun run --cwd apps/api cutover:session-ownership
   ```

2. Copy the printed `cutoff` exactly and record the aggregate output in RUD-215.
   The expected fields are:

   ```text
   candidateCount:
   claimableCount:
   alreadyClaimedCount:
   claimedCount: 0
   conflictedCount:
   skippedCount:
   skippedOrganizationCount:
   skippedDisposition.deleteLater:
   ```

   Skipped sessions whose organization or user no longer exists are classified
   as `deleteLater`. Disposition counts are distinct organization counts, while
   `skippedCount` counts sessions. `retain`, `archive`, and `migrate` remain zero
   unless a separate remediation decision changes that classification.

3. Stop if `conflictedCount` is non-zero. Resolve the conflict deliberately,
   rerun the preview, and record only the new aggregate counts.

4. Execute with the previewed cutoff:

   ```bash
   bun run --cwd apps/api cutover:session-ownership -- \
     --cutoff 2026-07-30T12:34:56.789Z \
     --execute
   ```

5. Repeat the exact execution command. `claimedCount` and `claimableCount` must
   both be zero on replay.

6. Upload one Claude session and one Codex session through the normal CLI/API
   path. Verify that each upload succeeds, its `session_ownership` claim exists,
   and its session detail is readable by its owner.

7. Verify the migration job reports
   `Migrations applied and ownership history verified.` This proves journal
   entries 0012 through 0016 are present on the same connection used by the
   deploy.

8. Attach the final aggregate output to RUD-215. The previous production
   backfill was expected to be about 68,000 claims; use the recorded production
   output, not that estimate, for closure.

The old Fly release hook has been removed. After both one-time operations in
this document have completed and their counts are attached to the tickets,
remove the two package commands and their scripts.

## RUD-213: non-canonical cleanup

Run this only after the final catch-up and upload checks pass.

The cleanup keeps rows whose `(organization_id, session_id)` claim points to the
row's `user_id`. Rows with a different registered owner or no claim are
non-canonical.

The deletion design follows ClickHouse's official mutation guidance:

- **Official:** use lightweight `DELETE FROM`, not `ALTER TABLE DELETE`, so
  rows are masked immediately and physically removed by normal merges.
- **Derived:** delete exact organization/session/user triples in small batches.
  The workload is a finite product-analytics correction, not a recurring
  mutable-state model.
- **Derived:** freeze candidates with a cutoff. Ownership claims are committed
  before new analytics rows are inserted, so rows written after the cutoff
  cannot be mistaken for unclaimed candidates.

References:
[lightweight deletes](https://clickhouse.com/docs/sql-reference/statements/delete),
[avoiding mutations](https://clickhouse.com/docs/best-practices/avoid-mutations).

1. Run the counts-only preview:

   ```bash
   bun run --cwd apps/api cleanup:session-ownership
   ```

2. Record `cutoff`, `nonCanonicalRowCount`, `nonCanonicalKeyCount`, and the
   per-table aggregate counts. Inspect ClickHouse mutation/part pressure before
   continuing. Stop if the measured work is unexpectedly broad.

3. Execute with the exact cutoff and previewed row count:

   ```bash
   bun run --cwd apps/api cleanup:session-ownership -- \
     --cutoff 2026-07-30T12:34:56.789Z \
     --expected-row-count 123 \
     --execute
   ```

   The expected count is a safety ceiling. A retry may find fewer rows after a
   partial first attempt, but it will stop if it finds more than the approved
   preview.

4. The command re-runs the bounded dry run after deletion and fails unless zero
   non-canonical rows remain. Repeat the same command; it must return
   `already_clean`.

5. Verify:

   - the registered owner's session detail remains readable;
   - the non-owner cannot read the session;
   - session lists contain only registered-owner rows;
   - aggregate values no longer include mismatched rows.

### Recovery

Lightweight deletion is not an application-level rollback mechanism. Before
execution, confirm the provider backup/restore point covers the selected
cutoff.

If a deletion fails or times out, keep all PostgreSQL ownership claims in place
and retry with the same cutoff and expected-row ceiling. The command confirms
query-level deletion before reporting success.

If the registry used for cleanup was wrong, stop uploads, restore the affected
ClickHouse data to a staging table from the pre-cleanup backup, select only rows
matching the authoritative ownership registry, and reinsert those canonical
rows. Re-run session detail, list, and aggregate verification before resuming.

## RUD-214: future per-session deletion

There is no single-session deletion route today. Do not add claim release to
the organization or account deletion paths; their foreign-key cascades already
have different semantics.

When a per-session delete feature is introduced, implement this state machine
in one service operation:

1. Authorize the registered owner for the organization and session.
2. Issue lightweight deletes for the exact organization/session key in both raw
   session tables and `session_analytics`. Delete every owner variant so a
   legacy mismatched row cannot survive claim release.
3. Confirm at query level that no rows for the organization/session remain.
4. Delete the PostgreSQL ownership claim with all three values in the predicate.
5. Return success. A later upload may create a new claim under the product's
   deliberate re-upload policy.

On a ClickHouse error, timeout, or unknown result, retain the claim and return a
recoverable failure. A retry starts at analytics deletion, which is idempotent.
If analytics deletion succeeded but claim deletion failed, the retained claim
prevents replacement; retrying completes the release safely.

Required feature tests:

- owner deletion succeeds and releases the claim;
- non-owner deletion is rejected without changing analytics or the claim;
- repeated deletion is idempotent;
- analytics failure or timeout retains the claim;
- claim-release failure is retryable after analytics removal;
- re-upload is rejected before completion and allowed only after claim release.
