import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionTurnEpisodeInput = SessionTurnTableOption & {
	memberText: string;
};

export type SessionTurnEpisode = {
	endIndex: number;
	indices: readonly number[];
	key: string;
	label: string;
	startIndex: number;
	stats: {
		cost: number | undefined;
		duration: number | undefined;
		errors: number;
		files: number;
		input: number | undefined;
		output: number | undefined;
		tools: number;
	};
};

const CONTINUATION_PATTERN =
	/^(y(es)?|no?|ok(ay)?|continue|proceed|go ahead|do it|thanks?|sure|yep|lgtm)\b/iu;

function getTimestampSeconds(timestamp: string | undefined) {
	if (!timestamp) {
		return undefined;
	}

	const value = Date.parse(timestamp);
	return Number.isNaN(value) ? undefined : value / 1_000;
}

export function startsNewEpisode(
	previous: SessionTurnEpisodeInput,
	current: SessionTurnEpisodeInput,
	gapThresholdSeconds = 1_800,
) {
	if (
		current.compactionsBefore.length > 0 ||
		current.slashCommands.length > 0
	) {
		return true;
	}

	const previousEnd = getTimestampSeconds(previous.timing.endTimestamp);
	const currentStart = getTimestampSeconds(current.timing.startTimestamp);
	if (
		previousEnd !== undefined &&
		currentStart !== undefined &&
		currentStart - previousEnd > gapThresholdSeconds
	) {
		return true;
	}

	const memberText = current.memberText.trim();
	return (
		memberText.split(/\s+/u).filter(Boolean).length > 3 &&
		!CONTINUATION_PATTERN.test(memberText)
	);
}

function sumDefined(values: readonly (number | undefined)[]) {
	const defined = values.filter((value) => value !== undefined);
	return defined.length === 0
		? undefined
		: defined.reduce((total, value) => total + value, 0);
}

function getEpisodeLabel(
	option: SessionTurnEpisodeInput,
	episodeNumber: number,
) {
	const normalized = option.memberText.replace(/\s+/gu, " ").trim();
	if (!normalized) {
		return episodeNumber === 1 ? "Session start" : `Episode ${episodeNumber}`;
	}

	return normalized.length > 72
		? `${normalized.slice(0, 69).trimEnd()}…`
		: normalized;
}

function buildEpisode(
	options: readonly SessionTurnEpisodeInput[],
	indices: readonly number[],
	episodeNumber: number,
): SessionTurnEpisode {
	const episodeOptions = indices.flatMap((index) => {
		const option = options[index];
		return option ? [option] : [];
	});
	const firstIndex = indices[0] ?? 0;
	const first = options[firstIndex];

	return {
		endIndex: indices.at(-1) ?? firstIndex,
		indices,
		key: `episode-${first?.key ?? firstIndex}`,
		label: first
			? getEpisodeLabel(first, episodeNumber)
			: `Episode ${episodeNumber}`,
		startIndex: firstIndex,
		stats: {
			cost: sumDefined(
				episodeOptions.map((option) => option.metrics.estimatedCost),
			),
			duration: sumDefined(
				episodeOptions.map((option) => option.timing.durationSeconds),
			),
			errors: episodeOptions.reduce(
				(total, option) => total + option.metrics.errorCount,
				0,
			),
			files: new Set(
				episodeOptions.flatMap((option) => option.metrics.editedFiles),
			).size,
			input: sumDefined(
				episodeOptions.map((option) => option.metrics.inputTokens),
			),
			output: sumDefined(
				episodeOptions.map((option) => option.metrics.outputTokens),
			),
			tools: episodeOptions.reduce(
				(total, option) => total + option.toolCallCount,
				0,
			),
		},
	};
}

export function groupTurnsIntoEpisodes(
	options: readonly SessionTurnEpisodeInput[],
	settings: { gapThresholdSeconds?: number } = {},
) {
	if (options.length === 0) {
		return [];
	}

	const episodeIndices: number[][] = [[0]];
	for (let index = 1; index < options.length; index += 1) {
		const previous = options[index - 1];
		const current = options[index];
		if (!previous || !current) {
			continue;
		}

		if (startsNewEpisode(previous, current, settings.gapThresholdSeconds)) {
			episodeIndices.push([index]);
		} else {
			episodeIndices.at(-1)?.push(index);
		}
	}

	return episodeIndices.map((indices, index) =>
		buildEpisode(options, indices, index + 1),
	);
}
