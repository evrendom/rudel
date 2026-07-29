import type { SessionAnalytics } from "@rudel/api-routes";
import { isAfter, subHours } from "date-fns";

/** Session dates come back without a zone marker but are always UTC. */
export function getSessionTimestamp(value: string) {
	const normalizedValue = value.endsWith("Z") ? value : `${value}Z`;
	return new Date(normalizedValue);
}

/**
 * The session order the sessions table renders, newest first.
 *
 * Shared so the detail sheet's previous/next navigation walks the same order
 * the user sees in the table. The rolling 24-hour view over-fetches two days,
 * so it drops anything older than the rolling window first.
 */
export function orderSessionsForDisplay({
	sessions,
	useRolling24Hours = false,
	now = new Date(),
}: {
	sessions: SessionAnalytics[] | undefined;
	useRolling24Hours?: boolean;
	now?: Date;
}): SessionAnalytics[] {
	const rollingWindowStart = subHours(now, 24);

	return (sessions ?? [])
		.filter((session) => {
			if (!useRolling24Hours) {
				return true;
			}

			return isAfter(
				getSessionTimestamp(session.session_date),
				rollingWindowStart,
			);
		})
		.sort(
			(leftSession, rightSession) =>
				getSessionTimestamp(rightSession.session_date).getTime() -
				getSessionTimestamp(leftSession.session_date).getTime(),
		);
}
