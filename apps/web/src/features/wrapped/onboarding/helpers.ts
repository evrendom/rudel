import {
	type PreviewableWrappedStepId,
	STEP_PREVIEW_QUERY_PARAM_PREFIX,
	WRAPPED_STEP_PREVIEW_OPTIONS,
	type WrappedStep,
} from "./config";

const INTRO_COMMIT_GRAPH = {
	columns: 53,
	rows: 19,
	totalDots: 365,
};

export type WrappedStepContentTone = "default" | "danger";

export interface WrappedStepContentLine {
	text: string;
	tone?: WrappedStepContentTone;
}

export interface WrappedVisibleProgressStep {
	displayNumber: number;
	routeIndex: number;
	step: WrappedStep;
}

export interface WrappedStoryProgress {
	currentNumber: number;
	total: number;
}

export type IntroCommitDotLevel = 0 | 1 | 2 | 3 | 4;

export interface IntroCommitDot {
	id: string;
	level: IntroCommitDotLevel;
}

export interface IntroStageModel {
	cardDetail: string;
	cardMeta: string;
	cardValue: string;
	footnote: string;
	headline: string;
}

export interface UploadStageModel {
	body: string;
	cardBody: string;
	cardEyebrow: string;
	headline: string;
	isUploading: boolean;
	rollItems: readonly UploadStageRollItem[];
}

export interface UploadStageRollItem {
	id: string;
	label: string;
	meta: string;
}

export function getStepPreviewStateParam(stepId: PreviewableWrappedStepId) {
	return `${STEP_PREVIEW_QUERY_PARAM_PREFIX}${stepId}`;
}

export function getSelectedPreviewState(
	stepId: PreviewableWrappedStepId,
	requestedState: string | null,
) {
	const normalizedRequestedState = requestedState?.trim() ?? "";
	return WRAPPED_STEP_PREVIEW_OPTIONS[stepId].some(
		(option) => option.value === normalizedRequestedState,
	)
		? normalizedRequestedState
		: "auto";
}

export function resolveActiveStepIndex(
	stepId: string | null,
	eligibleSteps: readonly WrappedStep[],
) {
	if (!stepId) {
		return 0;
	}

	const normalizedStepId =
		stepId === "presence" ? "skills" : stepId === "summary" ? "pulse" : stepId;

	const resolvedStepIndex = eligibleSteps.findIndex(
		(step) => step.id === normalizedStepId,
	);
	return resolvedStepIndex >= 0 ? resolvedStepIndex : 0;
}

export function getVisibleProgressSteps(
	activeStepIndex: number,
	eligibleSteps: readonly WrappedStep[],
): WrappedVisibleProgressStep[] {
	const MAX_VISIBLE_PROGRESS_STEPS = 10;
	const progressSteps = getOnboardingProgressSteps(eligibleSteps);

	if (progressSteps.length <= MAX_VISIBLE_PROGRESS_STEPS) {
		return progressSteps.map((step, progressIndex) => ({
			displayNumber: progressIndex + 1,
			routeIndex: resolveProgressRouteIndex(step, eligibleSteps),
			step,
		}));
	}

	const activeProgressIndex = Math.max(
		0,
		progressSteps.findIndex(
			(step) =>
				resolveProgressRouteIndex(step, eligibleSteps) === activeStepIndex,
		),
	);
	const maxStartIndex = progressSteps.length - MAX_VISIBLE_PROGRESS_STEPS;
	const desiredStartIndex = Math.max(
		0,
		activeProgressIndex - Math.floor(MAX_VISIBLE_PROGRESS_STEPS / 2),
	);
	const startIndex = Math.min(desiredStartIndex, maxStartIndex);

	return progressSteps
		.slice(startIndex, startIndex + MAX_VISIBLE_PROGRESS_STEPS)
		.map((step, visibleIndex) => ({
			displayNumber: startIndex + visibleIndex + 1,
			routeIndex: resolveProgressRouteIndex(step, eligibleSteps),
			step,
		}));
}

export function resolveStoryProgress(
	activeStepIndex: number,
	eligibleSteps: readonly WrappedStep[],
): WrappedStoryProgress | null {
	const activeStep = eligibleSteps[activeStepIndex] ?? null;

	if (!activeStep || activeStep.phase === "reward") {
		return null;
	}

	const progressSteps = getOnboardingProgressSteps(eligibleSteps);
	const currentIndex = progressSteps.findIndex(
		(step) => step.id === activeStep.id,
	);

	if (currentIndex < 0) {
		return null;
	}

	return {
		currentNumber: currentIndex + 1,
		total: progressSteps.length,
	};
}

function getOnboardingProgressSteps(eligibleSteps: readonly WrappedStep[]) {
	return eligibleSteps.filter((step) => step.phase === "story");
}

function resolveProgressRouteIndex(
	step: WrappedStep,
	eligibleSteps: readonly WrappedStep[],
) {
	return eligibleSteps.findIndex((candidate) => candidate.id === step.id);
}

export function resolveUploadStageModel(
	previewState: string,
): UploadStageModel {
	switch (previewState) {
		case "ready-single":
			return {
				body: "One export is in. Add another, or start the story.",
				cardBody: "1 export added",
				cardEyebrow: "Upload complete",
				headline: "Your upload is ready.",
				isUploading: false,
				rollItems: [
					{
						id: "cursor-export-1",
						label: "Cursor export",
						meta: "128 sessions",
					},
				],
			};
		case "ready-multi":
			return {
				body: "This pass is done. Add more, or keep going.",
				cardBody: "3 exports added",
				cardEyebrow: "Uploads complete",
				headline: "Your uploads are ready.",
				isUploading: false,
				rollItems: [
					{
						id: "cursor-export-1",
						label: "Cursor export",
						meta: "128 sessions",
					},
					{
						id: "cursor-export-2",
						label: "Cursor export",
						meta: "96 sessions",
					},
					{
						id: "claude-export-1",
						label: "Claude Code export",
						meta: "188 sessions",
					},
				],
			};
		default:
			return {
				body: "We'll start as soon as this upload pass finishes.",
				cardBody: "2 of 3 exports processed",
				cardEyebrow: "2 exports landed",
				headline: "Bringing your sessions in.",
				isUploading: true,
				rollItems: [
					{
						id: "cursor-export-1",
						label: "Cursor export",
						meta: "128 sessions added",
					},
					{
						id: "claude-export-1",
						label: "Claude Code export",
						meta: "156 sessions added",
					},
					{
						id: "windsurf-export-1",
						label: "Windsurf export",
						meta: "Still processing",
					},
				],
			};
	}
}

export function buildIntroContent(input: {
	activeDays: number;
	daysSinceFirst: number;
	displayName: string;
	totalSessions: number;
}): WrappedStepContentLine[] {
	const { activeDays, daysSinceFirst, displayName, totalSessions } = input;
	const resolvedActiveDays = Math.max(activeDays, totalSessions > 0 ? 1 : 0);
	const resolvedDaysSinceFirst = Math.max(daysSinceFirst, resolvedActiveDays);
	const greetingName = getGreetingName(displayName);

	if (totalSessions <= 0) {
		return [
			{ text: "No sessions yet." },
			{ text: "Start the run and the story will show up here." },
		];
	}

	if (totalSessions < 10) {
		return [
			{
				text: `Hey ${greetingName}, we got the outline.`,
			},
			{
				text: `${totalSessions.toLocaleString()} sessions in, and it's starting to show.`,
			},
			{
				text: `${resolvedActiveDays.toLocaleString()} active days across your first ${resolvedDaysSinceFirst.toLocaleString()} days.`,
			},
		];
	}

	return [
		{
			text: `Hey ${greetingName}, we got the shape of it.`,
		},
		{
			text: `${totalSessions.toLocaleString()} sessions later, a real pattern showed up.`,
		},
		{
			text: `${resolvedActiveDays.toLocaleString()} active days across ${resolvedDaysSinceFirst.toLocaleString()} days.`,
		},
	];
}

export function resolveIntroStageModel(input: {
	activeDays: number;
	daysSinceFirst: number;
	displayName: string;
	totalSessions: number;
}): IntroStageModel {
	const { activeDays, daysSinceFirst, displayName, totalSessions } = input;
	const resolvedActiveDays = Math.max(activeDays, totalSessions > 0 ? 1 : 0);
	const resolvedDaysSinceFirst = Math.max(daysSinceFirst, resolvedActiveDays);
	const greetingName = getGreetingName(displayName);

	if (totalSessions <= 0) {
		return {
			cardDetail: "across 0 days",
			cardMeta: "0 day run",
			cardValue: "0 active days",
			footnote:
				"As soon as sessions land, this step turns into your opening beat.",
			headline: "No sessions yet.",
		};
	}

	if (totalSessions < 10) {
		return {
			cardDetail: `across ${resolvedDaysSinceFirst.toLocaleString()} days`,
			cardMeta: `${totalSessions.toLocaleString()} sessions`,
			cardValue: `${resolvedActiveDays.toLocaleString()} active days`,
			footnote: "A light run, but enough signal to keep going.",
			headline: `Hey ${greetingName}, we got the outline.`,
		};
	}

	return {
		cardDetail: `across ${resolvedDaysSinceFirst.toLocaleString()} days`,
		cardMeta: `${totalSessions.toLocaleString()} sessions`,
		cardValue: `${resolvedActiveDays.toLocaleString()} active days`,
		footnote: "Enough signal to start the story with something real.",
		headline: `Hey ${greetingName}, we got the shape of it.`,
	};
}

export function buildIntroCommitGraph(input: {
	activeDays: number;
	daysSinceFirst: number;
	displayName: string;
	totalSessions: number;
}): IntroCommitDot[] {
	const totalDots = INTRO_COMMIT_GRAPH.totalDots;
	const resolvedVisibleDays = Math.max(
		0,
		Math.min(
			totalDots,
			Math.max(input.daysSinceFirst, input.totalSessions > 0 ? 1 : 0),
		),
	);
	const resolvedActiveDays = Math.max(
		0,
		Math.min(resolvedVisibleDays, input.activeDays),
	);
	const startOffset = totalDots - resolvedVisibleDays;
	const activeDotIndices = new Set<number>();
	const intensityByIndex = new Map<number, IntroCommitDotLevel>();

	if (resolvedVisibleDays > 0 && resolvedActiveDays > 0) {
		const random = createSeededRandom(
			input.totalSessions * 31 +
				input.activeDays * 17 +
				input.daysSinceFirst * 13 +
				input.displayName.length * 7,
		);
		const rankedDays = Array.from(
			{ length: resolvedVisibleDays },
			(_, dayIndex) => {
				const recency =
					resolvedVisibleDays <= 1 ? 1 : dayIndex / (resolvedVisibleDays - 1);
				const noise = random();
				const streak = (Math.sin((dayIndex + 1) * 0.72 + noise * 2.4) + 1) / 2;
				return {
					dayIndex,
					score: recency * 0.48 + noise * 0.32 + streak * 0.2,
				};
			},
		)
			.sort((left, right) => right.score - left.score)
			.slice(0, resolvedActiveDays)
			.sort((left, right) => left.dayIndex - right.dayIndex);

		for (const entry of rankedDays) {
			const graphIndex = startOffset + entry.dayIndex;
			activeDotIndices.add(graphIndex);
			const intensityNoise = (Math.sin((entry.dayIndex + 1) * 1.13) + 1) / 2;
			const recency =
				resolvedVisibleDays <= 1
					? 1
					: entry.dayIndex / (resolvedVisibleDays - 1);
			const intensityScore = recency * 0.55 + intensityNoise * 0.45;
			const level =
				intensityScore > 0.82
					? 4
					: intensityScore > 0.58
						? 3
						: intensityScore > 0.34
							? 2
							: 1;
			intensityByIndex.set(graphIndex, level);
		}
	}

	return Array.from({ length: totalDots }, (_, index) => ({
		id: `intro-commit-dot-${index}`,
		level: activeDotIndices.has(index) ? (intensityByIndex.get(index) ?? 1) : 0,
	}));
}

export function resolveIntroPreviewInput(
	input: {
		activeDays: number;
		daysSinceFirst: number;
		displayName: string;
		totalSessions: number;
	},
	previewState: string,
) {
	switch (previewState) {
		case "sparse":
			return {
				activeDays: 4,
				daysSinceFirst: 12,
				displayName: input.displayName,
				totalSessions: 7,
			};
		case "full":
			return {
				activeDays: 37,
				daysSinceFirst: 214,
				displayName: input.displayName,
				totalSessions: 128,
			};
		default:
			return input;
	}
}

function createSeededRandom(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0;
		return state / 4_294_967_296;
	};
}

function getGreetingName(displayName: string) {
	const trimmedDisplayName = displayName.trim();
	if (!trimmedDisplayName) {
		return "there";
	}

	return trimmedDisplayName.split(/\s+/)[0] ?? trimmedDisplayName;
}
