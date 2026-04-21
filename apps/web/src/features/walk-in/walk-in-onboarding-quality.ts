import { clampNumber, formatPercent } from "./walk-in-onboarding-format";

type QualityStageState =
	| "missing"
	| "strong"
	| "delivery-led"
	| "commit-led"
	| "iterating"
	| "success-only"
	| "commit-only";

interface QualityStageModel {
	comparisonLabel: string;
	commitRateLabel: string;
	commitShare: number;
	footnote: string;
	hasCommitRate: boolean;
	hasSuccessRate: boolean;
	headline: string;
	state: QualityStageState;
	stateLabel: string;
	subline: string;
	successRateLabel: string;
	successShare: number;
}

export function resolveQualityPreviewInput(
	input: {
		commitRate: number | null;
		successRate: number | null;
	},
	previewState: string,
) {
	switch (previewState) {
		case "strong":
			return { commitRate: 72, successRate: 88 };
		case "lands-commits-lag":
			return { commitRate: 41, successRate: 86 };
		case "ship-through-mess":
			return { commitRate: 67, successRate: 56 };
		case "iterate":
			return { commitRate: 34, successRate: 43 };
		case "lands-only":
			return { commitRate: null, successRate: 84 };
		case "iterating-only":
			return { commitRate: null, successRate: 47 };
		case "commit-only-high":
			return { commitRate: 64, successRate: null };
		case "commit-only-low":
			return { commitRate: 28, successRate: null };
		case "no-signal":
			return { commitRate: null, successRate: null };
		default:
			return input;
	}
}

export function resolveQualityStageModel(input: {
	commitRate: number | null;
	successRate: number | null;
}): QualityStageModel {
	const commitRate =
		input.commitRate !== null ? clampNumber(input.commitRate, 0, 100) : null;
	const successRate =
		input.successRate !== null ? clampNumber(input.successRate, 0, 100) : null;
	const state = getQualityStageState({ commitRate, successRate });

	return {
		comparisonLabel: getQualityStageComparisonLabel({
			commitRate,
			successRate,
		}),
		commitRateLabel: formatRateOrPending(commitRate),
		commitShare: getQualityStageShare(commitRate),
		footnote:
			"Commit rate and success rate come from the developer analytics window. Missing lanes mean that signal has not landed yet.",
		hasCommitRate: commitRate !== null,
		hasSuccessRate: successRate !== null,
		headline: getQualityStageHeadline({
			commitRate,
			state,
			successRate,
		}),
		state,
		stateLabel: getQualityStageStateLabel({
			commitRate,
			state,
			successRate,
		}),
		subline: getQualityStageSubline({
			commitRate,
			state,
			successRate,
		}),
		successRateLabel: formatRateOrPending(successRate),
		successShare: getQualityStageShare(successRate),
	};
}

function getQualityStageState(input: {
	commitRate: number | null;
	successRate: number | null;
}) {
	const { commitRate, successRate } = input;

	if (commitRate === null && successRate === null) {
		return "missing" as const;
	}

	if (commitRate !== null && successRate !== null) {
		if (commitRate >= 60 && successRate >= 80) {
			return "strong" as const;
		}
		if (successRate >= 80) {
			return "delivery-led" as const;
		}
		if (commitRate >= 60) {
			return "commit-led" as const;
		}
		return "iterating" as const;
	}

	if (commitRate === null) {
		return "success-only" as const;
	}

	return "commit-only" as const;
}

function getQualityStageHeadline(input: {
	commitRate: number | null;
	state: QualityStageState;
	successRate: number | null;
}) {
	const { commitRate, state, successRate } = input;

	switch (state) {
		case "strong":
			return "The work usually landed clean";
		case "delivery-led":
			return "The work landed more often than it committed";
		case "commit-led":
			return "You kept moving code through rougher sessions";
		case "iterating":
			return "This stretch was more iteration than finish";
		case "success-only":
			return successRate !== null && successRate >= 80
				? "The work usually landed clean"
				: "The finish signal is still settling";
		case "commit-only":
			return commitRate !== null && commitRate >= 60
				? "Code usually moved before the recap ended"
				: "Many sessions stayed exploratory";
		case "missing":
			return "The finish is still settling";
	}
}

function getQualityStageStateLabel(input: {
	commitRate: number | null;
	state: QualityStageState;
	successRate: number | null;
}) {
	const { commitRate, state, successRate } = input;

	switch (state) {
		case "strong":
			return "Strong finish";
		case "delivery-led":
			return "Lands clean";
		case "commit-led":
			return "Ships through";
		case "iterating":
			return "Still iterating";
		case "success-only":
			return successRate !== null && successRate >= 80
				? "Success signal"
				: "Partial finish";
		case "commit-only":
			return commitRate !== null && commitRate >= 60
				? "Commit signal"
				: "Exploratory";
		case "missing":
			return "Still landing";
	}
}

function getQualityStageSubline(input: {
	commitRate: number | null;
	state: QualityStageState;
	successRate: number | null;
}) {
	const { commitRate, state, successRate } = input;

	switch (state) {
		case "strong":
			return `${formatPercent(commitRate)} of sessions ended with commits, and ${formatPercent(successRate)} were marked successful.`;
		case "delivery-led":
			return `${formatPercent(successRate)} success led the window, even though commits landed in ${formatPercent(commitRate)} of sessions.`;
		case "commit-led":
			return `${formatPercent(commitRate)} of sessions moved code, even while success sat at ${formatPercent(successRate)}.`;
		case "iterating":
			return `${formatPercent(commitRate)} commits. ${formatPercent(successRate)} success. More loop than finish.`;
		case "success-only":
			return `${formatPercent(successRate)} success rate is in. Commit rate is still missing.`;
		case "commit-only":
			return `${formatPercent(commitRate)} commit rate is in. Success rate is still missing.`;
		case "missing":
			return "We will compare commit rate and success rate once more finished sessions land.";
	}
}

function getQualityStageComparisonLabel(input: {
	commitRate: number | null;
	successRate: number | null;
}) {
	const { commitRate, successRate } = input;

	if (commitRate !== null && successRate !== null) {
		const gap = Math.round(Math.abs(successRate - commitRate));

		if (gap <= 6) {
			return "Commit and success stayed close";
		}

		return successRate > commitRate
			? `Success led by ${gap} pts`
			: `Commits led by ${gap} pts`;
	}

	if (successRate !== null) {
		return "Commit lane pending";
	}

	if (commitRate !== null) {
		return "Success lane pending";
	}

	return "Waiting for finish signal";
}

function getQualityStageShare(rate: number | null) {
	if (rate === null || rate <= 0) {
		return 0;
	}

	return Math.min(100, Math.max(16, Math.round(rate)));
}

function formatRateOrPending(rate: number | null) {
	if (rate === null) {
		return "Pending";
	}

	return formatPercent(rate);
}
