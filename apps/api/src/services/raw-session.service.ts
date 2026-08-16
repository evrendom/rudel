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
	sessionDate: Date | string | null;
	sessionId: string;
	table: string;
	userId: string;
}

async function queryRawSessionPresence(
	identity: RawSessionIdentity,
	table: string,
	executor: RawSessionQueryExecutor,
	sessionDate?: string,
): Promise<boolean> {
	const dateFilter = sessionDate
		? "AND session_date BETWEEN parseDateTime64BestEffort({sessionDate:String}, 3, 'UTC') - INTERVAL 1 DAY AND parseDateTime64BestEffort({sessionDate:String}, 3, 'UTC') + INTERVAL 1 DAY"
		: "";
	const rows = await executor.query<{ present: number }>({
		query: `
			SELECT 1 AS present
			FROM ${table}
			WHERE organization_id = {organizationId:String}
				${dateFilter}
				AND session_id = {sessionId:String}
				AND user_id = {userId:String}
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
}

function serializeSessionDate(
	sessionDate: Date | string | null,
): string | undefined {
	if (!sessionDate) return undefined;
	const parsedDate =
		sessionDate instanceof Date ? sessionDate : new Date(sessionDate);
	if (Number.isNaN(parsedDate.getTime())) return undefined;
	return parsedDate.toISOString();
}

export async function hasRawSessionRow(
	identity: RawSessionIdentity,
	executor: RawSessionQueryExecutor = getClickhouse(),
): Promise<boolean> {
	const table = getSafeClickHouseTable(identity.table);
	const sessionDate = serializeSessionDate(identity.sessionDate);

	if (sessionDate) {
		try {
			if (
				await queryRawSessionPresence(identity, table, executor, sessionDate)
			) {
				return true;
			}
		} catch (error) {
			logger.warn(
				"Bounded raw-session duplicate probe failed; retrying without the date bound (organization_id={organizationId} session_id={sessionId} error={error})",
				{
					error: String(error),
					organizationId: identity.organizationId,
					sessionId: identity.sessionId,
				},
			);
		}
	}

	try {
		return await queryRawSessionPresence(identity, table, executor);
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
