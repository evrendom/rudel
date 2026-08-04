import { getLogger } from "@logtape/logtape";
import {
	type ClickHouseExecutor,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";

type RawSessionQueryExecutor = Pick<ClickHouseExecutor, "query">;

const logger = getLogger(["rudel", "api", "raw-session-service"]);

interface RawSessionIdentity {
	organizationId: string;
	sessionDate: Date | null;
	sessionId: string;
	table: string;
	userId: string;
}

export async function hasRawSessionRow(
	identity: RawSessionIdentity,
	executor: RawSessionQueryExecutor = getClickhouse(),
): Promise<boolean> {
	const table = getSafeClickHouseTable(identity.table);

	try {
		const sessionDate = identity.sessionDate?.toISOString();
		const dateFilter = sessionDate
			? "AND session_date BETWEEN parseDateTime64BestEffort({sessionDate:String}, 3, 'UTC') - INTERVAL 1 DAY AND parseDateTime64BestEffort({sessionDate:String}, 3, 'UTC') + INTERVAL 1 DAY"
			: "";
		const rows = await executor.query<{ present: number }>({
			query: `
				SELECT 1 AS present
				FROM ${table}
				WHERE organization_id = {organizationId:String}
					AND user_id = {userId:String}
					AND session_id = {sessionId:String}
					${dateFilter}
				LIMIT 1
			`,
			query_params: {
				organizationId: identity.organizationId,
				...(sessionDate ? { sessionDate } : {}),
				sessionId: identity.sessionId,
				userId: identity.userId,
			},
		});
		return rows.length > 0;
	} catch (error) {
		logger.warn(
			"Raw-session duplicate probe failed; continuing with ingest (organization_id={organizationId} session_id={sessionId} error={error})",
			{
				error: String(error),
				organizationId: identity.organizationId,
				sessionId: identity.sessionId,
			},
		);
		return false;
	}
}
