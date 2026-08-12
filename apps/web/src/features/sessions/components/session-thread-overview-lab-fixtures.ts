import type { TraceItem } from "@/components/conversation/conversation-trace";
import type { SelectedTurnOption } from "./session-selected-turn";

export const SESSION_OVERVIEW_LAB_SCENARIOS = [
	{ label: "Marathon (46h bursty)", value: "marathon" },
	{ label: "Sprint (40 min)", value: "sprint" },
	{ label: "Error storm", value: "error-storm" },
	{ label: "Skill heavy", value: "skill-heavy" },
	{ label: "Missing data", value: "missing-data" },
	{ label: "Density stress (420 turns)", value: "density-stress" },
	{ label: "Single turn", value: "single-turn" },
	{ label: "Empty", value: "empty" },
] as const;

export type SessionOverviewLabScenario =
	(typeof SESSION_OVERVIEW_LAB_SCENARIOS)[number]["value"];

export type SessionOverviewLabFixture = {
	options: readonly SelectedTurnOption[];
	subagents: Readonly<Record<string, string>>;
};

// Fixed epoch keeps every scenario deterministic; never use Date.now() here.
const LAB_EPOCH_MS = Date.parse("2026-08-02T10:00:00.000Z");
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// mulberry32 — tiny deterministic PRNG so fixtures are stable across renders
// and test runs while still looking organic.
function createRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function formatUtcClock(timestampMs: number) {
	const date = new Date(timestampMs);
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}

function formatDurationLabel(durationSeconds: number) {
	if (durationSeconds < 60) {
		return `${Math.round(durationSeconds)} sec`;
	}
	return `${Math.round(durationSeconds / 60)} min`;
}

type LabTurnInput = {
	cost: number | undefined;
	durationSeconds: number;
	editCount: number;
	errorCount: number;
	hasTimestamps: boolean;
	index: number;
	inputTokens: number | undefined;
	outputTokens: number | undefined;
	reasoningCount: number;
	skillCount: number;
	startMs: number;
};

function createLabTurnOption(input: LabTurnInput): SelectedTurnOption {
	const endMs = input.startMs + input.durationSeconds * 1_000;
	const startTimestamp = new Date(input.startMs).toISOString();
	const endTimestamp = new Date(endMs).toISOString();
	const responseItems: TraceItem[] = [
		{
			events: Array.from({ length: input.reasoningCount }, (_, eventIndex) => ({
				id: `turn-${input.index}-reasoning-${eventIndex}`,
				kind: "reasoning",
				text: "Deterministic lab reasoning block",
				timestamp: startTimestamp,
			})),
			id: `turn-${input.index}-agent`,
			kind: "agent",
			timestamp: startTimestamp,
		},
	];

	return {
		compactionsBefore: [],
		key: `lab-turn-${input.index}`,
		memberPreview: `Lab prompt ${input.index + 1}`,
		metrics: {
			editedFiles: Array.from(
				{ length: input.editCount },
				(_, fileIndex) => `src/lab/file-${input.index}-${fileIndex}.ts`,
			),
			errorCount: input.errorCount,
			estimatedCost: input.cost,
			inputTokens: input.inputTokens,
			outputTokens: input.outputTokens,
			skills: Array.from(
				{ length: input.skillCount },
				(_, skillIndex) => `lab-skill-${skillIndex}`,
			),
			usageEvents: [],
		},
		preview: `Lab response ${input.index + 1}`,
		slashCommands: [],
		timing: {
			durationLabel: formatDurationLabel(input.durationSeconds),
			durationSeconds: input.durationSeconds,
			endTime: formatUtcClock(endMs),
			endTimestamp: input.hasTimestamps ? endTimestamp : undefined,
			startTime: formatUtcClock(input.startMs),
			startTimestamp: input.hasTimestamps ? startTimestamp : undefined,
		},
		toolCallCount: input.editCount + input.skillCount,
		turn: { responseItems, userItems: [] },
		turnNumber: input.index + 1,
	};
}

function createSubagentTranscript(startMs: number, endMs: number) {
	return [
		JSON.stringify({ timestamp: new Date(startMs).toISOString() }),
		JSON.stringify({ timestamp: new Date(endMs).toISOString() }),
	].join("\n");
}

function buildMarathonFixture(): SessionOverviewLabFixture {
	const random = createRandom(46);
	const interBurstGapsMs = [
		75 * MINUTE_MS,
		2 * HOUR_MS,
		3 * HOUR_MS,
		12 * HOUR_MS,
	];
	const options: SelectedTurnOption[] = [];
	let cursorMs = LAB_EPOCH_MS;
	let index = 0;

	while (index < 78) {
		const burstSize = Math.min(3 + Math.floor(random() * 7), 78 - index);
		for (let burstIndex = 0; burstIndex < burstSize; burstIndex += 1) {
			const durationSeconds = 30 + Math.floor(random() * 330);
			const costSeed = random();
			options.push(
				createLabTurnOption({
					cost: Number((costSeed * costSeed * 9 + 0.05).toFixed(2)),
					durationSeconds,
					editCount: random() < 0.3 ? 1 + Math.floor(random() * 3) : 0,
					errorCount: random() < 0.08 ? 1 + Math.floor(random() * 2) : 0,
					hasTimestamps: true,
					index,
					inputTokens: 50_000 + Math.floor(random() * 850_000),
					outputTokens: 200 + Math.floor(random() * 7_800),
					reasoningCount: Math.floor(random() * 7),
					skillCount: random() < 0.1 ? 1 + Math.floor(random() * 2) : 0,
					startMs: cursorMs,
				}),
			);
			cursorMs +=
				durationSeconds * 1_000 + (1 + Math.floor(random() * 7)) * MINUTE_MS;
			index += 1;
		}
		const gap =
			interBurstGapsMs[Math.floor(random() * interBurstGapsMs.length)] ??
			HOUR_MS;
		cursorMs += gap;
	}

	const subagentAnchorMs = LAB_EPOCH_MS + 5 * HOUR_MS;
	return {
		options,
		subagents: {
			"lab-subagent-1": createSubagentTranscript(
				subagentAnchorMs,
				subagentAnchorMs + 25 * MINUTE_MS,
			),
			"lab-subagent-2": createSubagentTranscript(
				subagentAnchorMs + 9 * HOUR_MS,
				subagentAnchorMs + 9 * HOUR_MS + 40 * MINUTE_MS,
			),
		},
	};
}

function buildSprintFixture(): SessionOverviewLabFixture {
	const random = createRandom(40);
	return {
		options: Array.from({ length: 25 }, (_, index) =>
			createLabTurnOption({
				cost: Number((random() * 0.8 + 0.02).toFixed(2)),
				durationSeconds: 40 + Math.floor(random() * 45),
				editCount: random() < 0.4 ? 1 : 0,
				errorCount: 0,
				hasTimestamps: true,
				index,
				inputTokens: 20_000 + Math.floor(random() * 120_000),
				outputTokens: 300 + Math.floor(random() * 2_500),
				reasoningCount: Math.floor(random() * 3),
				skillCount: index === 6 ? 1 : 0,
				startMs: LAB_EPOCH_MS + index * 95 * 1_000,
			}),
		),
		subagents: {},
	};
}

function buildErrorStormFixture(): SessionOverviewLabFixture {
	const random = createRandom(13);
	return {
		options: Array.from({ length: 30 }, (_, index) =>
			createLabTurnOption({
				cost: Number((random() * 2 + 0.05).toFixed(2)),
				durationSeconds: 45 + Math.floor(random() * 180),
				editCount: random() < 0.25 ? 1 : 0,
				errorCount: random() < 0.6 ? 1 + Math.floor(random() * 3) : 0,
				hasTimestamps: true,
				index,
				inputTokens: 40_000 + Math.floor(random() * 400_000),
				outputTokens: 250 + Math.floor(random() * 4_000),
				reasoningCount: Math.floor(random() * 4),
				skillCount: 0,
				startMs: LAB_EPOCH_MS + index * 4 * MINUTE_MS,
			}),
		),
		subagents: {},
	};
}

function buildSkillHeavyFixture(): SessionOverviewLabFixture {
	const random = createRandom(21);
	const skillCounts = [1, 3, 12];
	const subagentAnchorMs = LAB_EPOCH_MS + 20 * MINUTE_MS;
	return {
		options: Array.from({ length: 20 }, (_, index) =>
			createLabTurnOption({
				cost: Number((random() * 3 + 0.1).toFixed(2)),
				durationSeconds: 60 + Math.floor(random() * 240),
				editCount: index % 2 === 0 ? 1 + Math.floor(random() * 4) : 0,
				errorCount: index === 9 ? 1 : 0,
				hasTimestamps: true,
				index,
				inputTokens: 100_000 + Math.floor(random() * 500_000),
				outputTokens: 500 + Math.floor(random() * 6_000),
				reasoningCount: 1 + Math.floor(random() * 5),
				skillCount: skillCounts[index % skillCounts.length] ?? 1,
				startMs: LAB_EPOCH_MS + index * 6 * MINUTE_MS,
			}),
		),
		subagents: {
			"lab-subagent-a": createSubagentTranscript(
				subagentAnchorMs,
				subagentAnchorMs + 15 * MINUTE_MS,
			),
			"lab-subagent-b": createSubagentTranscript(
				subagentAnchorMs + 10 * MINUTE_MS,
				subagentAnchorMs + 45 * MINUTE_MS,
			),
			"lab-subagent-c": createSubagentTranscript(
				subagentAnchorMs + 60 * MINUTE_MS,
				subagentAnchorMs + 80 * MINUTE_MS,
			),
		},
	};
}

function buildMissingDataFixture(): SessionOverviewLabFixture {
	const random = createRandom(7);
	return {
		options: Array.from({ length: 24 }, (_, index) =>
			createLabTurnOption({
				cost:
					index % 2 === 0
						? undefined
						: Number((random() * 1.5 + 0.05).toFixed(2)),
				durationSeconds: 50 + Math.floor(random() * 200),
				editCount: 0,
				errorCount: index === 11 ? 1 : 0,
				hasTimestamps: index % 3 !== 0,
				index,
				inputTokens:
					index % 5 === 0 ? undefined : 30_000 + Math.floor(random() * 200_000),
				outputTokens:
					index % 7 === 0 ? undefined : 200 + Math.floor(random() * 3_000),
				reasoningCount: Math.floor(random() * 3),
				skillCount: index === 4 ? 1 : 0,
				startMs: LAB_EPOCH_MS + index * 5 * MINUTE_MS,
			}),
		),
		subagents: {},
	};
}

function buildDensityStressFixture(): SessionOverviewLabFixture {
	const random = createRandom(420);
	return {
		options: Array.from({ length: 420 }, (_, index) =>
			createLabTurnOption({
				cost: Number((random() * 0.5 + 0.01).toFixed(2)),
				durationSeconds: 15 + Math.floor(random() * 45),
				editCount: random() < 0.15 ? 1 : 0,
				errorCount: random() < 0.04 ? 1 : 0,
				hasTimestamps: true,
				index,
				inputTokens: 10_000 + Math.floor(random() * 90_000),
				outputTokens: 100 + Math.floor(random() * 1_200),
				reasoningCount: Math.floor(random() * 2),
				skillCount: random() < 0.05 ? 1 : 0,
				startMs: LAB_EPOCH_MS + index * 50 * 1_000,
			}),
		),
		subagents: {},
	};
}

function buildSingleTurnFixture(): SessionOverviewLabFixture {
	return {
		options: [
			createLabTurnOption({
				cost: 1.42,
				durationSeconds: 210,
				editCount: 2,
				errorCount: 1,
				hasTimestamps: true,
				index: 0,
				inputTokens: 240_000,
				outputTokens: 5_400,
				reasoningCount: 3,
				skillCount: 1,
				startMs: LAB_EPOCH_MS,
			}),
		],
		subagents: {},
	};
}

export function buildSessionOverviewLabFixture(
	scenario: SessionOverviewLabScenario,
): SessionOverviewLabFixture {
	switch (scenario) {
		case "marathon":
			return buildMarathonFixture();
		case "sprint":
			return buildSprintFixture();
		case "error-storm":
			return buildErrorStormFixture();
		case "skill-heavy":
			return buildSkillHeavyFixture();
		case "missing-data":
			return buildMissingDataFixture();
		case "density-stress":
			return buildDensityStressFixture();
		case "single-turn":
			return buildSingleTurnFixture();
		case "empty":
			return { options: [], subagents: {} };
	}
}

export function parseSessionOverviewLabScenario(
	value: string,
): SessionOverviewLabScenario {
	const match = SESSION_OVERVIEW_LAB_SCENARIOS.find(
		(scenario) => scenario.value === value,
	);
	return match?.value ?? "marathon";
}
