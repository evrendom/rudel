import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import type { WrappedTeamMemberCardBackMetric } from "./card-back";

export function buildWrappedTeamCardBackMetrics(input: {
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
	shareCardCreatedAtLabel: string;
}): readonly WrappedTeamMemberCardBackMetric[] {
	const { onboardingMetrics, row, shareCardCreatedAtLabel } = input;
	const activeDays = Math.max(
		0,
		onboardingMetrics.activeDays || row.activeDays,
	);
	const totalSessions = Math.max(
		0,
		onboardingMetrics.totalSessions || row.totalSessions,
	);
	const totalTokens = Math.max(
		0,
		onboardingMetrics.totalTokens || row.totalTokens,
	);
	const inputTokens = Math.max(0, row.inputTokens);
	const outputTokens = Math.max(0, row.outputTokens);
	const avgSessionMin =
		onboardingMetrics.avgSessionMin && onboardingMetrics.avgSessionMin > 0
			? onboardingMetrics.avgSessionMin
			: null;
	const commitRate =
		onboardingMetrics.commitRate && onboardingMetrics.commitRate > 0
			? onboardingMetrics.commitRate
			: null;
	const successRate =
		onboardingMetrics.successRate && onboardingMetrics.successRate > 0
			? onboardingMetrics.successRate
			: null;
	const longestSessionMin =
		onboardingMetrics.longestSessionMin &&
		onboardingMetrics.longestSessionMin > 0
			? onboardingMetrics.longestSessionMin
			: null;
	const estimatedSpend = Math.max(
		0,
		Math.round(Math.max(row.cost, onboardingMetrics.estimatedCostUsd)),
	);
	const reposTouched = Math.max(0, onboardingMetrics.repoPulse.totalRepos);
	const skillSessionsUsed = getWrappedBackFeatureSessionCount(
		totalSessions,
		onboardingMetrics.skillsAdoptionRate,
	);
	const commandSessionsUsed = getWrappedBackFeatureSessionCount(
		totalSessions,
		onboardingMetrics.slashCommandsAdoptionRate,
	);
	const subagentSessionsUsed = getWrappedBackFeatureSessionCount(
		totalSessions,
		onboardingMetrics.subagentsAdoptionRate,
	);
	const claudeShare = Math.round(
		onboardingMetrics.sourceSplit.find(
			(entry) => entry.source === "claude_code",
		)?.session_share_percent ?? 0,
	);
	const codexShare = Math.round(
		onboardingMetrics.sourceSplit.find((entry) => entry.source === "codex")
			?.session_share_percent ?? 0,
	);
	const dollarsPerCommit =
		onboardingMetrics.commitSessions > 0
			? estimatedSpend / onboardingMetrics.commitSessions
			: 0;
	const issuedDateLabel = formatWrappedBackIssuedDate(shareCardCreatedAtLabel);

	return [
		{
			label: "Sessions",
			value: formatWrappedBackInteger(totalSessions),
		},
		{
			label: "Active days",
			value: formatWrappedBackInteger(activeDays),
		},
		{
			label: "Avg session min",
			value: formatWrappedBackInteger(avgSessionMin),
		},
		{
			label: "Longest session min",
			value: formatWrappedBackInteger(longestSessionMin),
		},
		{
			label: "Input/output tokens",
			value: formatWrappedBackIntegerPair(inputTokens, outputTokens),
		},
		{
			label: "Total tokens",
			value: formatWrappedBackInteger(totalTokens),
		},
		{
			label: "Commit rate %",
			value: formatWrappedBackInteger(commitRate),
		},
		{
			label: "Success rate %",
			value: formatWrappedBackInteger(successRate),
		},
		{
			label: "Claude/Codex %",
			value: formatWrappedBackPercentPair(claudeShare, codexShare),
		},
		{
			label: "Skills used",
			value: formatWrappedBackInteger(skillSessionsUsed),
		},
		{
			label: "Favorite skill",
			value: onboardingMetrics.topSkills[0]?.name ?? "Skill issue",
		},
		{
			label: "Commands used",
			value: formatWrappedBackInteger(commandSessionsUsed),
		},
		{
			label: "Sub-agents used",
			value: formatWrappedBackInteger(subagentSessionsUsed),
		},
		{
			label: "Repos touched",
			value: formatWrappedBackInteger(reposTouched),
		},
		{
			label: "Spent",
			value: formatWrappedBackInteger(estimatedSpend),
		},
		{
			label: "Dollar per commit",
			value: formatWrappedBackDecimal(dollarsPerCommit),
		},
		{
			label: "",
			slot: "footer",
			value: issuedDateLabel,
		},
	];
}

function formatWrappedBackInteger(value: number | null) {
	if (value === null || !Number.isFinite(value)) {
		return "0";
	}

	return Math.round(Math.max(0, value)).toString();
}

function formatWrappedBackIntegerPair(
	leftValue: number | null,
	rightValue: number | null,
) {
	return `${formatWrappedBackInteger(leftValue)}/${formatWrappedBackInteger(rightValue)}`;
}

function formatWrappedBackPercentPair(
	leftValue: number | null,
	rightValue: number | null,
) {
	return `${formatWrappedBackInteger(leftValue)}%/${formatWrappedBackInteger(rightValue)}%`;
}

function formatWrappedBackDecimal(value: number | null) {
	if (value === null || !Number.isFinite(value) || value <= 0) {
		return "0";
	}

	const roundedValue = Math.round(value * 10) / 10;

	return Number.isInteger(roundedValue)
		? roundedValue.toString()
		: roundedValue.toFixed(1);
}

function getWrappedBackFeatureSessionCount(
	totalSessions: number,
	adoptionRate: number | null,
) {
	if (!Number.isFinite(totalSessions) || totalSessions <= 0) {
		return 0;
	}

	if (
		adoptionRate === null ||
		!Number.isFinite(adoptionRate) ||
		adoptionRate <= 0
	) {
		return 0;
	}

	return Math.min(
		totalSessions,
		Math.max(0, Math.round((totalSessions * adoptionRate) / 100)),
	);
}

function formatWrappedBackIssuedDate(value: string) {
	const parsedDate = new Date(value);

	if (Number.isNaN(parsedDate.getTime())) {
		const [month = "", day = "", year = ""] = value
			.split(/[^\d]+/)
			.filter(Boolean);

		if (month && day && year) {
			return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
		}

		return value;
	}

	const month = `${parsedDate.getMonth() + 1}`.padStart(2, "0");
	const day = `${parsedDate.getDate()}`.padStart(2, "0");
	const year = parsedDate.getFullYear().toString();

	return `${month}/${day}/${year}`;
}
