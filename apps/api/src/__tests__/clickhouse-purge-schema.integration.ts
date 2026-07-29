import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
	createClickHouseExecutor,
	getSafeClickHouseTable,
	shutdownClickhouse,
} from "../clickhouse.js";
import {
	deleteOrgSessions,
	deleteUserSessions,
} from "../services/org-session.service.js";

const PROBE_PREFIX = `purge_index_${Date.now()}_${crypto.randomUUID()}_`;
const PROBE_GROUP_COUNT = 16;
const ROWS_PER_GROUP = 8_192;
const PROBE_ROW_COUNT = PROBE_GROUP_COUNT * ROWS_PER_GROUP;
const SNAPSHOT_TABLE = getSafeClickHouseTable(
	"rudel.wrapped_user_archetype_snapshots_v1",
);

const clickhouse = createClickHouseExecutor({
	url: process.env.CLICKHOUSE_URL as string,
	username:
		process.env.CLICKHOUSE_USERNAME || process.env.CLICKHOUSE_USER || "default",
	password: process.env.CLICKHOUSE_PASSWORD || "",
	database: process.env.CLICKHOUSE_DB || "default",
});

setDefaultTimeout(120_000);

afterAll(async () => {
	await clickhouse.execute({
		clickhouse_settings: { lightweight_deletes_sync: "1" },
		query: `DELETE FROM ${SNAPSHOT_TABLE} WHERE startsWith(snapshot_id, {prefix:String})`,
		query_params: { prefix: PROBE_PREFIX },
	});
	await Promise.all([clickhouse.close(), shutdownClickhouse()]);
});

describe("ClickHouse purge access paths", () => {
	test("declares every purge identity index and primary-key path", async () => {
		const indexes = await clickhouse.query<{
			granularity: number;
			name: string;
			table: string;
			type: string;
		}>({
			query: `
				SELECT table, name, type, granularity
				FROM system.data_skipping_indices
				WHERE database = 'rudel'
					AND startsWith(name, 'idx_purge_')
				ORDER BY table, name
			`,
		});

		expect(indexes).toEqual([
			{
				granularity: 4,
				name: "idx_purge_organization_id",
				table: "claude_sessions",
				type: "bloom_filter",
			},
			{
				granularity: 4,
				name: "idx_purge_user_id",
				table: "claude_sessions",
				type: "bloom_filter",
			},
			{
				granularity: 4,
				name: "idx_purge_organization_id",
				table: "codex_sessions",
				type: "bloom_filter",
			},
			{
				granularity: 4,
				name: "idx_purge_user_id",
				table: "codex_sessions",
				type: "bloom_filter",
			},
			{
				granularity: 4,
				name: "idx_purge_organization_id",
				table: "session_analytics",
				type: "bloom_filter",
			},
			{
				granularity: 4,
				name: "idx_purge_user_id",
				table: "session_analytics",
				type: "bloom_filter",
			},
			{
				granularity: 1,
				name: "idx_purge_organization_id",
				table: "wrapped_user_archetype_snapshots_v1",
				type: "bloom_filter",
			},
			{
				granularity: 1,
				name: "idx_purge_user_id",
				table: "wrapped_user_archetype_snapshots_v1",
				type: "bloom_filter",
			},
		]);

		const primaryKeys = await clickhouse.query<{
			name: string;
			primary_key: string;
		}>({
			query: `
				SELECT name, primary_key
				FROM system.tables
				WHERE database = 'rudel'
					AND name IN (
						'claude_sessions',
						'codex_sessions',
						'session_analytics'
					)
				ORDER BY name
			`,
		});
		expect(primaryKeys).toEqual([
			{
				name: "claude_sessions",
				primary_key: "organization_id, session_date, session_id",
			},
			{
				name: "codex_sessions",
				primary_key: "organization_id, session_date, session_id",
			},
			{
				name: "session_analytics",
				primary_key: "organization_id, session_date, session_id",
			},
		]);
	});

	test("prunes identity granules and preserves non-target rows during purges", async () => {
		await clickhouse.execute({
			query: `
				INSERT INTO ${SNAPSHOT_TABLE} (
					snapshot_id,
					snapshot_created_at,
					pipeline_version,
					centroid_version,
					scope,
					organization_id,
					user_id,
					first_session_at,
					last_session_at
				)
				SELECT
					concat(
						{prefix:String},
						leftPad(toString(intDiv(number, {rowsPerGroup:UInt32})), 4, '0'),
						'_',
						leftPad(toString(number), 8, '0')
					),
					now64(3),
					'test',
					'test',
					'test',
					concat(
						{prefix:String},
						'org_',
						leftPad(toString(intDiv(number, {rowsPerGroup:UInt32})), 4, '0')
					),
					concat(
						{prefix:String},
						'user_',
						leftPad(toString(intDiv(number, {rowsPerGroup:UInt32})), 4, '0')
					),
					now64(3),
					now64(3)
				FROM numbers({rowCount:UInt32})
			`,
			query_params: {
				prefix: PROBE_PREFIX,
				rowCount: PROBE_ROW_COUNT,
				rowsPerGroup: ROWS_PER_GROUP,
			},
		});

		const targetOrganizationId = `${PROBE_PREFIX}org_0007`;
		const targetUserId = `${PROBE_PREFIX}user_0008`;
		const preservedOrganizationId = `${PROBE_PREFIX}org_0009`;
		const organizationExplain = await explainIdentityPredicate(
			"organization_id",
			targetOrganizationId,
		);
		const userExplain = await explainIdentityPredicate("user_id", targetUserId);

		expectSkipIndexPrunes(
			organizationExplain,
			"Name: idx_purge_organization_id",
		);
		expectSkipIndexPrunes(userExplain, "Name: idx_purge_user_id");

		await deleteOrgSessions(targetOrganizationId);
		expect(
			await countIdentityRows("organization_id", targetOrganizationId),
		).toBe(0);

		await deleteUserSessions(targetUserId);
		expect(await countIdentityRows("user_id", targetUserId)).toBe(0);
		expect(
			await countIdentityRows("organization_id", preservedOrganizationId),
		).toBe(ROWS_PER_GROUP);
	});
});

async function explainIdentityPredicate(
	column: "organization_id" | "user_id",
	value: string,
): Promise<string> {
	const rows = await clickhouse.query<{ explain: string }>({
		query: `EXPLAIN indexes = 1 SELECT 1 FROM ${SNAPSHOT_TABLE} WHERE ${column} = {value:String} LIMIT 1`,
		query_params: { value },
	});
	return rows.map((row) => row.explain).join("\n");
}

async function countIdentityRows(
	column: "organization_id" | "user_id",
	value: string,
): Promise<number> {
	const [row] = await clickhouse.query<{ count: string }>({
		query: `SELECT count() AS count FROM ${SNAPSHOT_TABLE} WHERE ${column} = {value:String}`,
		query_params: { value },
	});
	return Number(row?.count ?? 0);
}

function expectSkipIndexPrunes(explain: string, indexNameLine: string): void {
	const indexStart = explain.indexOf(indexNameLine);
	expect(indexStart).toBeGreaterThanOrEqual(0);
	const indexSection = explain.slice(indexStart);
	const granules = indexSection.match(/Granules: (\d+)\/(\d+)/);
	expect(granules).not.toBeNull();
	expect(Number(granules?.[1])).toBeLessThan(Number(granules?.[2]));
}
