import {
	type ClickHouseExecutor,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";

type RawSessionQueryExecutor = Pick<ClickHouseExecutor, "query">;

interface RawSessionIdentity {
	organizationId: string;
	sessionId: string;
	table: string;
	userId: string;
}

export async function hasRawSessionRow(
	identity: RawSessionIdentity,
	executor: RawSessionQueryExecutor = getClickhouse(),
): Promise<boolean> {
	const table = getSafeClickHouseTable(identity.table);
	const rows = await executor.query<{ present: number }>({
		query: `
			SELECT 1 AS present
			FROM ${table}
			WHERE organization_id = {organizationId:String}
				AND user_id = {userId:String}
				AND session_id = {sessionId:String}
			LIMIT 1
		`,
		query_params: {
			organizationId: identity.organizationId,
			sessionId: identity.sessionId,
			userId: identity.userId,
		},
	});
	return rows.length > 0;
}
