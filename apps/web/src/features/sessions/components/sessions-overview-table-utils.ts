import type { SessionAnalytics } from "@rudel/api-routes";
import { getSessionTimestamp } from "@/features/sessions/session-ordering";
import { calculateCost, formatUsername } from "@/lib/format";

export const SESSION_OVERVIEW_GRID_CLASS_NAME =
	"grid-cols-[250px_215px_288px_200px_150px_120px_140px_180px]";
export const SESSION_OVERVIEW_MIN_WIDTH_CLASS_NAME = "min-w-[1543px]";
export const SESSION_OVERVIEW_COLUMNS = [
	{ align: "left", key: "session", label: "Session" },
	{ align: "left", key: "user", label: "User" },
	{ align: "left", key: "repository", label: "Repository" },
	{ align: "left", key: "model", label: "Model" },
	{ align: "right", key: "tokens", label: "Tokens" },
	{ align: "right", key: "cost", label: "Cost" },
	{ align: "right", key: "duration", label: "Duration" },
	{ align: "right", key: "time", label: "Time" },
] as const;

export type SessionOverviewColumnKey =
	(typeof SESSION_OVERVIEW_COLUMNS)[number]["key"];
export type SortDirection = "asc" | "desc";
export type SessionSortState = {
	key: SessionOverviewColumnKey;
	direction: SortDirection;
};

export function compareSessions(
	leftSession: SessionAnalytics,
	rightSession: SessionAnalytics,
	sortKey: SessionOverviewColumnKey,
	userMap: Record<string, string>,
) {
	switch (sortKey) {
		case "session":
			return compareSessionLabels(
				leftSession.session_id,
				rightSession.session_id,
			);
		case "user":
			return compareSessionLabels(
				formatUsername(leftSession.user_id, userMap),
				formatUsername(rightSession.user_id, userMap),
			);
		case "repository":
			return compareSessionLabels(
				getRepositoryLabel(leftSession),
				getRepositoryLabel(rightSession),
			);
		case "model":
			return compareSessionLabels(
				leftSession.model_used,
				rightSession.model_used,
			);
		case "tokens":
			return leftSession.total_tokens - rightSession.total_tokens;
		case "cost":
			return (
				calculateCost(
					leftSession.input_tokens,
					leftSession.output_tokens,
					leftSession.model_used,
				) -
				calculateCost(
					rightSession.input_tokens,
					rightSession.output_tokens,
					rightSession.model_used,
				)
			);
		case "duration":
			return leftSession.duration_min - rightSession.duration_min;
		case "time":
			return (
				getSessionTimestamp(leftSession.session_date).getTime() -
				getSessionTimestamp(rightSession.session_date).getTime()
			);
	}
}

export function getInitialSortDirection(
	sortKey: SessionOverviewColumnKey,
): SortDirection {
	switch (sortKey) {
		case "tokens":
		case "cost":
		case "duration":
		case "time":
			return "desc";
		default:
			return "asc";
	}
}

export function getRepositoryLabel(session: SessionAnalytics) {
	const primaryPath = session.repository || session.project_path;
	const segments = primaryPath.split("/").filter(Boolean);

	if (segments.length === 0) {
		return "Untitled project";
	}

	return segments.slice(-2).join("/");
}

export function getSessionIdentifier(sessionId: string) {
	const identifier =
		sessionId.split("-")[0]?.slice(0, 8) || sessionId.slice(0, 8);
	return identifier.toUpperCase();
}

export function compareSessionLabels(leftValue: string, rightValue: string) {
	return leftValue.localeCompare(rightValue, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}
