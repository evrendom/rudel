const SOURCE_MARKERS = [
	"FROM rudel.claude_sessions AS cs",
	"FROM rudel.codex_sessions AS cs",
] as const;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export interface SessionScope {
	organizationId: string;
	sessionId: string;
}

/**
 * Scopes a materialized-view SELECT body to a single session.
 *
 * Injects predicates immediately after the raw source rather than wrapping the
 * query, so the inner `ROW_NUMBER()` sees only the fixture rows.
 *
 * `organization_id` leads because it is the first column of the source table's
 * ORDER BY `(organization_id, session_date, session_id)` — a session-only predicate
 * cannot use the primary index. `session_id` is still required: tests in one run
 * share an organization id and each asserts an exact row count.
 *
 * Throws unless exactly one known source marker appears. If a future SQL edit
 * moves or duplicates it, this fails loudly instead of scanning everything.
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

	const matchingMarkers = SOURCE_MARKERS.filter(
		(marker) => mvSql.split(marker).length === 2,
	);
	if (matchingMarkers.length !== 1) {
		throw new Error(
			`withSessionFilter: expected exactly one source marker, found ${matchingMarkers.length}`,
		);
	}
	const marker = matchingMarkers[0];
	if (!marker) throw new Error("withSessionFilter: source marker missing");

	return mvSql.replace(
		marker,
		`${marker}\n  WHERE cs.organization_id = '${scope.organizationId}'` +
			` AND cs.session_id = '${scope.sessionId}'`,
	);
}
