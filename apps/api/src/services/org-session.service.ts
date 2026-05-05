import { getAllAdapters } from "@rudel/agent-adapters";
import {
	type ClickHouseStatement,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";

interface SessionCountRow {
	count: string;
}

interface GetOrgSessionCountOptions {
	querySessionCount?: (
		statement: ClickHouseStatement,
	) => Promise<SessionCountRow[]>;
	rawTableNames?: readonly string[];
}

export async function getOrgSessionCount(
	orgId: string,
	userId?: string,
	options: GetOrgSessionCountOptions = {},
): Promise<number> {
	const querySessionCount =
		options.querySessionCount ??
		((statement: ClickHouseStatement) =>
			getClickhouse().query<SessionCountRow>(statement));

	if (userId) {
		const rows = await querySessionCount({
			query: `SELECT count() as count FROM ${getSafeClickHouseTable("rudel.session_analytics")} FINAL WHERE organization_id = {orgId:String} AND user_id = {userId:String}`,
			query_params: {
				orgId,
				userId,
			},
		});

		return Number(rows[0]?.count ?? 0);
	}

	const tables =
		options.rawTableNames ?? getAllAdapters().map((a) => a.rawTableName);
	const results = await Promise.all(
		tables.map((table) =>
			querySessionCount({
				query: `SELECT count() as count FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String}`,
				query_params: {
					orgId,
				},
			}),
		),
	);
	return results.reduce((sum, rows) => sum + Number(rows[0]?.count ?? 0), 0);
}

export async function hasOrgUploadsInLastDays(
	orgId: string,
	days: number,
): Promise<boolean> {
	const ch = getClickhouse();
	const tables = getAllAdapters().map((a) => a.rawTableName);
	const results = await Promise.all(
		tables.map((table) =>
			ch.query<{ count: string }>({
				query: `SELECT count() as count FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String} AND session_date >= now64(3) - toIntervalDay({days:UInt32})`,
				query_params: {
					orgId,
					days,
				},
			}),
		),
	);
	return results.some((rows) => Number(rows[0]?.count ?? 0) > 0);
}

export function deleteOrgSessions(orgId: string): void {
	const ch = getClickhouse();
	const tables = getAllAdapters().map((a) => a.rawTableName);
	Promise.all([
		...tables.map((table) =>
			ch.execute({
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {orgId:String}`,
				query_params: {
					orgId,
				},
			}),
		),
		ch.execute({
			query: `DELETE FROM ${getSafeClickHouseTable("rudel.session_analytics")} WHERE organization_id = {orgId:String}`,
			query_params: {
				orgId,
			},
		}),
	]).catch((error) => {
		console.error(
			`[deleteOrgSessions] async ClickHouse deletion failed for org=${orgId}:`,
			error,
		);
	});
}
