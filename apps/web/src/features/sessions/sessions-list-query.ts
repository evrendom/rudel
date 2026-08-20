import type { SessionListInput } from "@rudel/api-routes";
import { buildSessionListDateInput } from "@/features/sessions/session-date-ranges";

export function buildSessionsListQueryInput({
	dayCount,
	endDate,
	startDate,
	today,
}: {
	dayCount: number;
	endDate: string;
	startDate: string;
	today?: Date;
}): SessionListInput {
	return {
		...buildSessionListDateInput({ dayCount, endDate, startDate, today }),
		limit: 1000,
		sortBy: "session_date",
		sortOrder: "desc",
	};
}
