import type { SessionAnalytics } from "@rudel/api-routes";

export function getSessionNeighbours({
	canViewSession,
	orderedSessions,
	selectedSessionId,
}: {
	canViewSession: (userId: string) => boolean;
	orderedSessions: readonly SessionAnalytics[];
	selectedSessionId: string | null;
}) {
	const selectedSessionIndex = orderedSessions.findIndex(
		(session) => session.session_id === selectedSessionId,
	);

	return {
		previousSession: getViewableNeighbour({
			canViewSession,
			orderedSessions,
			selectedSessionIndex,
			step: -1,
		}),
		nextSession: getViewableNeighbour({
			canViewSession,
			orderedSessions,
			selectedSessionIndex,
			step: 1,
		}),
	};
}

function getViewableNeighbour({
	canViewSession,
	orderedSessions,
	selectedSessionIndex,
	step,
}: {
	canViewSession: (userId: string) => boolean;
	orderedSessions: readonly SessionAnalytics[];
	selectedSessionIndex: number;
	step: -1 | 1;
}) {
	if (selectedSessionIndex === -1) {
		return undefined;
	}

	const neighbour = orderedSessions[selectedSessionIndex + step];

	return neighbour && canViewSession(neighbour.user_id) ? neighbour : undefined;
}
