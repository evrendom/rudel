const MARKER = "WHERE length(_timestamps) > 0";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export interface SessionScope {
	organizationId: string;
	sessionId: string;
}

/**
 * Scopes a materialized-view SELECT body to a single session.
 *
 * Injects the predicates into the MV's own trailing WHERE rather than wrapping the
 * query, so the inner `ROW_NUMBER() OVER (PARTITION BY cs.session_id ...)` is
 * evaluated over the filtered rows instead of the whole table.
 *
 * `organization_id` leads because it is the first column of the source table's
 * ORDER BY `(organization_id, session_date, session_id)` — a session-only predicate
 * cannot use the primary index. `session_id` is still required: tests in one run
 * share an organization id and each asserts an exact row count.
 *
 * Throws unless the marker appears exactly once. If a future SQL edit moves or
 * duplicates that clause, this fails loudly rather than silently producing an
 * unfiltered query that scans everything.
 *
 * Test-only. The chkit executor's `query<T>(sql)` takes a bare string, so the ids are
 * interpolated; the allowlist below is what makes that safe.
 */
export function withSessionFilter(mvSql: string, scope: SessionScope): string {
	for (const [label, value] of Object.entries(scope)) {
		if (!SAFE_ID.test(value)) {
			throw new Error(
				`withSessionFilter: unsafe ${label} ${JSON.stringify(value)}`,
			);
		}
	}

	const parts = mvSql.split(MARKER);
	if (parts.length !== 2) {
		throw new Error(
			`withSessionFilter: expected exactly 1 occurrence of "${MARKER}", found ${parts.length - 1}`,
		);
	}

	return parts.join(
		`WHERE cs.organization_id = '${scope.organizationId}'` +
			` AND cs.session_id = '${scope.sessionId}'` +
			` AND length(_timestamps) > 0`,
	);
}
