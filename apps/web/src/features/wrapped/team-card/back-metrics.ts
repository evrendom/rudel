import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { hasWrappedRecapFeatureSignal } from "@/features/wrapped/onboarding/models/feature-signal";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { formatCurrency } from "@/lib/format";
import type { WrappedTeamMemberCardBackMetric } from "./card-back";

export function buildWrappedTeamCardBackMetrics(input: {
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
	shareCardCreatedAtLabel: string;
}): readonly WrappedTeamMemberCardBackMetric[] {
	const { onboardingMetrics, shareCardCreatedAtLabel } = input;
	const activeDays = Math.max(0, onboardingMetrics.activeDays);
	const totalSessions = Math.max(0, onboardingMetrics.totalSessions);
	const totalTokens = Math.max(0, onboardingMetrics.totalTokens);
	const inputTokens = Math.max(0, onboardingMetrics.inputTokens);
	const outputTokens = Math.max(0, onboardingMetrics.outputTokens);
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
	const estimatedSpend = Math.max(0, onboardingMetrics.estimatedCostUsd);
	const reposTouched = Math.max(0, onboardingMetrics.distinctProjectCount);
	const hasSkillRecapSignal = hasWrappedRecapFeatureSignal({
		adoptionRate: onboardingMetrics.skillsAdoptionRate,
		topItemCount: onboardingMetrics.topSkills[0]?.count ?? null,
	});
	const hasSlashCommandRecapSignal = hasWrappedRecapFeatureSignal({
		adoptionRate: onboardingMetrics.slashCommandsAdoptionRate,
		topItemCount: getWrappedBackTopSlashCommandCount(onboardingMetrics),
	});
	const skillSessionsUsed = hasSkillRecapSignal
		? getWrappedBackFeatureSessionCount(
				onboardingMetrics.recentWindowSessions,
				onboardingMetrics.skillsAdoptionRate,
			)
		: 0;
	const commandSessionsUsed = hasSlashCommandRecapSignal
		? getWrappedBackFeatureSessionCount(
				onboardingMetrics.recentWindowSessions,
				onboardingMetrics.slashCommandsAdoptionRate,
			)
		: 0;
	const subagentSessionsUsed = getWrappedBackFeatureSessionCount(
		onboardingMetrics.recentWindowSessions,
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
			label: "Input (incl. cache)/output",
			value: formatWrappedBackTokenPair(inputTokens, outputTokens),
		},
		{
			label: "Total tokens",
			value: formatWrappedBackTokenCount(totalTokens),
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
			label: "Skills used (365d)",
			value: formatWrappedBackInteger(skillSessionsUsed),
		},
		{
			label: "FAV SKILL",
			value: hasSkillRecapSignal
				? (onboardingMetrics.topSkills[0]?.name ?? "Skill issue")
				: "Skill issue",
			valueTruncation: "start",
		},
		{
			label: "Commands used (365d)",
			value: formatWrappedBackInteger(commandSessionsUsed),
		},
		{
			label: "Sub-agents used (365d)",
			value: formatWrappedBackInteger(subagentSessionsUsed),
		},
		{
			label: "Repos touched",
			value: formatWrappedBackInteger(reposTouched),
		},
		{
			label: "Estimated spend",
			value: formatCurrency(estimatedSpend),
		},
		{
			label: "Estimated $ / commit",
			value: formatCurrency(dollarsPerCommit),
		},
		{
			label: "",
			slot: "footer",
			value: issuedDateLabel,
		},
	];
}

function getWrappedBackTopSlashCommandCount(
	onboardingMetrics: WrappedOnboardingMetrics,
) {
	if (onboardingMetrics.topSlashCommand !== null) {
		const matchedTopCommand = onboardingMetrics.topSlashCommands.find(
			(command) => command.name === onboardingMetrics.topSlashCommand,
		);

		if (matchedTopCommand !== undefined) {
			return Math.max(0, matchedTopCommand.count);
		}
	}

	if (onboardingMetrics.topSlashCommandCount !== null) {
		return Math.max(0, onboardingMetrics.topSlashCommandCount);
	}

	const firstRankedCommand = onboardingMetrics.topSlashCommands[0];

	if (firstRankedCommand !== undefined) {
		return Math.max(0, firstRankedCommand.count);
	}

	return onboardingMetrics.topSlashCommand === null ? 0 : null;
}

function formatWrappedBackInteger(value: number | null) {
	if (value === null || !Number.isFinite(value)) {
		return "0";
	}

	return Math.round(Math.max(0, value)).toString();
}

function formatWrappedBackTokenPair(
	leftValue: number | null,
	rightValue: number | null,
) {
	return `${formatWrappedBackTokenCount(leftValue)}/${formatWrappedBackTokenCount(rightValue)}`;
}

function formatWrappedBackTokenCount(value: number | null) {
	if (value === null || !Number.isFinite(value)) {
		return "0";
	}

	const integerValue = Math.round(Math.max(0, value));

	if (integerValue < 1000) {
		return integerValue.toString();
	}

	if (integerValue >= 1_000_000) {
		return `${formatWrappedBackScaledTokenCount(integerValue, 1_000_000)}M`;
	}

	return `${formatWrappedBackScaledTokenCount(integerValue, 1000)}K`;
}

function formatWrappedBackScaledTokenCount(value: number, scale: number) {
	const scaledValue = value / scale;
	const roundedValue = roundWrappedBackValueToSecondDigit(scaledValue);

	return roundedValue.toLocaleString("en-US", {
		maximumFractionDigits: roundedValue < 10 ? 1 : 0,
	});
}

function roundWrappedBackValueToSecondDigit(value: number) {
	const digitMagnitude = 10 ** Math.floor(Math.log10(value));
	const roundingScale = digitMagnitude / 10;

	return Math.round(value / roundingScale) * roundingScale;
}

function formatWrappedBackPercentPair(
	leftValue: number | null,
	rightValue: number | null,
) {
	return `${formatWrappedBackInteger(leftValue)}%/${formatWrappedBackInteger(rightValue)}%`;
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
