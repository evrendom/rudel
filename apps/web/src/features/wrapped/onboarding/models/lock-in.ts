import { formatDurationMinutes } from "../format";

type LockInStageState =
	| "missing"
	| "settled"
	| "stretched"
	| "got-away"
	| "didnt-end";

interface LockInStageModel {
	averageDurationLabel: string;
	averageShare: number;
	comparisonLabel: string;
	footnote: string;
	headline: string;
	longestDurationLabel: string;
	longestShare: number;
	state: LockInStageState;
	stateLabel: string;
	subline: string;
}

export function resolveLockInPreviewInput(
	input: {
		avgSessionMin: number | null;
		longestSessionMin: number | null;
	},
	previewState: string,
) {
	switch (previewState) {
		case "none":
			return { avgSessionMin: 38, longestSessionMin: 24 };
		case "stretched":
			return { avgSessionMin: 62, longestSessionMin: 88 };
		case "got-away":
			return { avgSessionMin: 55, longestSessionMin: 136 };
		case "didnt-end":
			return { avgSessionMin: 54, longestSessionMin: 288 };
		default:
			return input;
	}
}

export function resolveLockInStageModel(input: {
	avgSessionMin: number | null;
	longestSessionMin: number | null;
}): LockInStageModel {
	const longestSessionMin =
		input.longestSessionMin && input.longestSessionMin > 0
			? input.longestSessionMin
			: null;
	const avgSessionMin =
		input.avgSessionMin && input.avgSessionMin > 0 ? input.avgSessionMin : null;

	if (longestSessionMin === null) {
		return {
			averageDurationLabel: "No average yet",
			averageShare: 0,
			comparisonLabel: "No recorded duration yet",
			footnote:
				"Longest session is all time. Usual session uses average duration over the analytics window.",
			headline: "Your session rhythm is still landing",
			longestDurationLabel: "No record yet",
			longestShare: 0,
			state: "missing",
			stateLabel: "Still landing",
			subline:
				"We will compare the longest recorded session to your usual session length once more history lands.",
		};
	}

	const overrunMin =
		avgSessionMin !== null ? longestSessionMin - avgSessionMin : null;
	const ratio =
		avgSessionMin !== null && avgSessionMin > 0
			? longestSessionMin / avgSessionMin
			: null;
	const comparisonMaxDuration = Math.max(
		longestSessionMin,
		avgSessionMin ?? longestSessionMin,
	);
	const state = getLockInStageState({
		avgSessionMin,
		longestSessionMin,
		overrunMin,
		ratio,
	});
	const longestDurationLabel = formatDurationMinutes(longestSessionMin);
	const averageDurationLabel =
		avgSessionMin !== null
			? formatDurationMinutes(avgSessionMin)
			: "No average yet";
	const comparisonLabel =
		overrunMin === null
			? "Average still catching up"
			: overrunMin <= 0
				? "Stayed inside your usual pace"
				: `+${formatDurationMinutes(overrunMin)} over usual`;

	return {
		averageDurationLabel,
		averageShare: getLockInStageShare(avgSessionMin, comparisonMaxDuration),
		comparisonLabel,
		footnote:
			"Longest session is all time. Usual session uses average duration over the analytics window.",
		headline: getLockInStageHeadline(state, longestSessionMin),
		longestDurationLabel,
		longestShare: getLockInStageShare(longestSessionMin, comparisonMaxDuration),
		state,
		stateLabel: getLockInStageStateLabel(state, ratio),
		subline: getLockInStageSubline({
			avgSessionMin,
			longestDurationLabel,
			overrunMin,
			ratio,
			state,
		}),
	};
}

function getLockInStageState(input: {
	avgSessionMin: number | null;
	longestSessionMin: number;
	overrunMin: number | null;
	ratio: number | null;
}): LockInStageState {
	const { avgSessionMin, longestSessionMin, overrunMin, ratio } = input;

	if (avgSessionMin !== null) {
		if ((overrunMin ?? 0) <= 0) {
			return "settled";
		}
		if ((ratio ?? 0) > 4) {
			return "didnt-end";
		}
		if ((ratio ?? 0) >= 2) {
			return "got-away";
		}
		return "stretched";
	}

	if (longestSessionMin < 30) {
		return "settled";
	}
	if (longestSessionMin >= 180) {
		return "didnt-end";
	}
	if (longestSessionMin >= 90) {
		return "got-away";
	}
	return "stretched";
}

function getLockInStageShare(
	durationMin: number | null,
	maxDurationMin: number,
) {
	if (durationMin === null || durationMin <= 0 || maxDurationMin <= 0) {
		return 0;
	}

	return Math.min(
		100,
		Math.max(18, Math.round((durationMin / maxDurationMin) * 100)),
	);
}

function getLockInStageHeadline(
	state: LockInStageState,
	longestSessionMin: number,
) {
	switch (state) {
		case "settled":
			return longestSessionMin < 30
				? "Your sessions stayed contained"
				: "Your sessions stayed in rhythm";
		case "stretched":
			return "One session stretched past the usual";
		case "got-away":
			return "One session got away from you";
		case "didnt-end":
			return "One session did not want to end";
		case "missing":
			return "Your session rhythm is still landing";
	}
}

function getLockInStageStateLabel(
	state: LockInStageState,
	ratio: number | null,
) {
	switch (state) {
		case "settled":
			return "Contained";
		case "stretched":
			return ratio !== null ? `${ratio.toFixed(1)}x usual` : "Stretched";
		case "got-away":
			return ratio !== null ? `${ratio.toFixed(1)}x usual` : "Runaway";
		case "didnt-end":
			return ratio !== null ? `${ratio.toFixed(1)}x usual` : "Marathon";
		case "missing":
			return "Still landing";
	}
}

function getLockInStageSubline(input: {
	avgSessionMin: number | null;
	longestDurationLabel: string;
	overrunMin: number | null;
	ratio: number | null;
	state: LockInStageState;
}) {
	const { avgSessionMin, longestDurationLabel, overrunMin, ratio, state } =
		input;
	const averageDurationLabel =
		avgSessionMin !== null ? formatDurationMinutes(avgSessionMin) : null;

	switch (state) {
		case "settled":
			return averageDurationLabel
				? `${longestDurationLabel} was the longest recorded run. Your usual session sits around ${averageDurationLabel}.`
				: `${longestDurationLabel} was your longest recorded session, without turning into a runaway.`;
		case "stretched":
			return averageDurationLabel
				? `${longestDurationLabel} was the record. A usual session sits around ${averageDurationLabel}.`
				: `${longestDurationLabel} was the record run, even though the average session is still catching up.`;
		case "got-away":
			return averageDurationLabel && overrunMin !== null
				? `${longestDurationLabel} ran ${formatDurationMinutes(overrunMin)} past a usual ${averageDurationLabel}.`
				: `${longestDurationLabel} clearly ran longer than your normal rhythm.`;
		case "didnt-end":
			return averageDurationLabel && ratio !== null
				? `${longestDurationLabel} landed at ${ratio.toFixed(1)}x your usual ${averageDurationLabel}.`
				: `${longestDurationLabel} stretched well past a normal session.`;
		case "missing":
			return "We will compare the longest recorded session to your usual session length once more history lands.";
	}
}
