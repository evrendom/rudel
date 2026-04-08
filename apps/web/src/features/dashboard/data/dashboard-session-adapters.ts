import type { SessionAnalyticsSummaryComparison } from "@rudel/api-routes";
import type {
	DashboardDeltaTone,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";

export function buildDashboardSessionTabMetrics(
	summaryComparison: SessionAnalyticsSummaryComparison | undefined,
): DashboardHeadlineMetric[] {
	const current = summaryComparison?.current;
	const changes = summaryComparison?.changes;
	const totalSessions = current?.total_sessions ?? 0;
	const averageDuration = current?.avg_session_duration_min ?? 0;
	const averageResponseTime = current?.avg_response_time_sec ?? 0;
	const totalSessionChange = changes?.total_sessions ?? 0;
	const averageDurationChange = changes?.avg_session_duration_min ?? 0;
	const averageResponseTimeChange = changes?.avg_response_time_sec ?? 0;

	return [
		{
			description: "Total AI sessions in the selected range.",
			deltaLabel: formatSignedPercentChange(totalSessionChange),
			deltaTone: getDeltaTone(totalSessionChange),
			id: "sessions",
			label: "Sessions run",
			valueLabel: totalSessions.toString(),
		},
		{
			description: "Average session duration.",
			deltaLabel: formatSignedPercentChange(averageDurationChange),
			deltaTone: getDeltaTone(averageDurationChange, { inverse: true }),
			id: "uncommitted",
			label: "Avg duration",
			valueLabel: `${averageDuration.toFixed(1)}m`,
		},
		{
			description: "Average time between session interactions.",
			deltaLabel: formatSignedPercentChange(averageResponseTimeChange),
			deltaTone: getDeltaTone(averageResponseTimeChange, { inverse: true }),
			id: "commitRate",
			label: "Avg response",
			valueLabel: `${averageResponseTime.toFixed(1)}s`,
		},
	];
}

function formatSignedPercentChange(value: number) {
	if (!Number.isFinite(value) || value === 0) {
		return "0%";
	}

	const roundedValue =
		Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);

	return `${value > 0 ? "+" : ""}${roundedValue}%`;
}

function getDeltaTone(
	value: number,
	options?: {
		inverse?: boolean;
	},
): DashboardDeltaTone {
	if (!Number.isFinite(value) || value === 0) {
		return "neutral";
	}

	const isPositive = options?.inverse ? value < 0 : value > 0;
	return isPositive ? "positive" : "negative";
}
