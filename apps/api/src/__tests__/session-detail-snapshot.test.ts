import { describe, expect, test } from "bun:test";
import {
	buildSessionDetailCurrentRevisionSql,
	buildSessionDetailRawSnapshotSql,
} from "../services/session-detail-snapshot.service.js";

describe("session detail ClickHouse snapshot", () => {
	test("selects raw revision, content, and subagents in one argMax tuple", () => {
		const sql = buildSessionDetailRawSnapshotSql();
		const compact = sql.replace(/\s+/gu, " ");

		expect(compact).toContain(
			"SELECT argMax( tuple( source, organization_id, user_id, session_id, content, subagents, ingested_at",
		);
		expect(sql).not.toMatch(/argMax\s*\(\s*content/iu);
		expect(sql).not.toMatch(/argMax\s*\(\s*subagents/iu);
		expect(compact).toContain(
			"ON tupleElement(analytics.snapshot, 1) = tupleElement(raw.snapshot, 7)",
		);
		expect(compact).toContain("LEFT ANY JOIN latest_analytics AS analytics");
		expect(compact).not.toContain("INNER JOIN latest_analytics AS analytics");
	});

	test("retains a raw session while its analytics row is missing or lagging", () => {
		const sql = buildSessionDetailRawSnapshotSql().replace(/\s+/gu, " ");
		expect(sql).toContain("FROM latest_raw AS raw LEFT ANY JOIN");
		expect(sql).toContain(
			"ON tupleElement(analytics.snapshot, 1) = tupleElement(raw.snapshot, 7)",
		);
	});

	test("parameterizes uploader, owner, and session filters in both raw tables", () => {
		const sql = buildSessionDetailRawSnapshotSql();
		expect(sql.match(/organization_id = \{orgId:String\}/gu)).toHaveLength(3);
		expect(sql.match(/user_id = \{ownerId:String\}/gu)).toHaveLength(3);
		expect(sql.match(/session_id = \{sessionId:String\}/gu)).toHaveLength(3);
	});

	test("reads the current source and revision as one tuple", () => {
		const sql = buildSessionDetailCurrentRevisionSql().replace(/\s+/gu, " ");
		expect(sql).toContain(
			"argMax(tuple(source, ingested_at), ingested_at) AS snapshot",
		);
	});
});
