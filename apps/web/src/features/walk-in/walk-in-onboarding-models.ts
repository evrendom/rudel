import type { MonthlyModelUsage, WrappedSourceSplit } from "@rudel/api-routes";
import type { CSSProperties } from "react";
import type { WalkInStep } from "./walk-in-onboarding-config";
import {
	buildIntroContent,
	resolveIntroPreviewInput,
	type WalkInStepContentLine,
} from "./walk-in-onboarding-helpers";
import type {
	WalkInOnboardingMetrics,
	WalkInRepoPulseMetrics,
	WalkInSkillUsageItem,
} from "./walk-in-onboarding-types";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
	maximumFractionDigits: 1,
	notation: "compact",
});

export const SKILLS_STACK = {
	focusTopRem: 5.35,
	interactionLockMs: 220,
	shadowBleedRem: 0.65,
	stepRem: 2.95,
	touchThresholdPx: 34,
	viewportHeightRem: 16.2,
	visibleCards: 3,
	wheelResetMs: 140,
	wheelThresholdPx: 36,
} as const;

export const SCALE_STAGE_TOKENS_PER_BALL = 2_000_000;
export const SCALE_STAGE_MIN_BALL_COUNT = 50;

interface RepoPulseStageModel {
	entries: WalkInRepoPulseMetrics["entries"];
	footnote: string;
	headline: string;
	subline: string;
	totalReposLabel: string;
	totalSessionsLabel: string;
}

interface ToolsStageEntry {
	id: string;
	isPlaceholder: boolean;
	name: string;
	usageLabel: string;
	usageRate: number | null;
}

interface ToolsStageModel {
	entries: readonly ToolsStageEntry[];
	footnote: string;
	headline: string;
	subline: string;
}

interface WalkInModelShareSegment {
	id: string;
	label: string;
	sessionCount: number;
	share: number;
	source: WrappedSourceSplit["source"];
}

interface WalkInModelShareMonth {
	id: string;
	label: string;
	leaderLabel: string;
	leaderShare: number;
	segments: readonly WalkInModelShareSegment[];
	totalSessions: number;
}

interface ModelStageModel {
	footnote: string;
	headline: string;
	months: readonly WalkInModelShareMonth[];
	monthsLabel: string;
	subline: string;
	summary: readonly WalkInModelShareSegment[];
	totalSessionsLabel: string;
}

interface ScaleRainBall {
	delayMs: number;
	driftPx: number;
	durationMs: number;
	endRotationDeg: number;
	hue: number;
	id: string;
	leftPercent: number;
	sizePx: number;
	startRotationDeg: number;
	startYOffsetPx: number;
	staticTopSvh: number;
	zIndex: number;
}

interface ScaleStageModel {
	displayBallCount: number;
	footnote: string;
	headline: string;
	showsMinimumFloor: boolean;
	subline: string;
	totalTokens: number;
}

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

const MODEL_STAGE_SOURCE_ORDER = ["claude_code", "codex"] as const;

const MODEL_STAGE_TONES: Record<WrappedSourceSplit["source"], string> = {
	claude_code: "#ff9a2f",
	codex: "#2d6df6",
};

export function buildStepContent(input: {
	displayName: string;
	onboardingMetrics: WalkInOnboardingMetrics;
	previewState: string;
	stepId: WalkInStep["id"];
	totalSessions: number;
}): WalkInStepContentLine[] {
	const {
		displayName,
		onboardingMetrics,
		previewState,
		stepId,
		totalSessions,
	} = input;

	switch (stepId) {
		case "intro":
			return buildIntroContent(
				resolveIntroPreviewInput(
					{
						activeDays: onboardingMetrics.activeDays,
						daysSinceFirst: onboardingMetrics.daysSinceFirst,
						displayName,
						totalSessions,
					},
					previewState,
				),
			);
		case "model": {
			const modelStage = resolveModelStageModel(
				resolveModelPreviewInput(
					{
						modelByMonth: onboardingMetrics.modelByMonth,
						sourceSplit: onboardingMetrics.sourceSplit,
					},
					previewState,
				),
			);
			return [{ text: modelStage.headline }, { text: modelStage.subline }];
		}
		case "scale":
			return buildScaleContent(
				resolveScalePreviewTokens(onboardingMetrics.totalTokens, previewState),
			);
		case "tools": {
			const toolsPreview = resolveToolsPreviewInput(
				{
					slashCommandsAdoptionRate:
						onboardingMetrics.slashCommandsAdoptionRate,
					subagentsAdoptionRate: onboardingMetrics.subagentsAdoptionRate,
					topSlashCommand: onboardingMetrics.topSlashCommand,
					topSlashCommands: onboardingMetrics.topSlashCommands,
					topSlashCommandCount: onboardingMetrics.topSlashCommandCount,
					topSubagent: onboardingMetrics.topSubagent,
					topSubagents: onboardingMetrics.topSubagents,
					topSubagentCount: onboardingMetrics.topSubagentCount,
					totalSessions: onboardingMetrics.totalSessions,
				},
				previewState,
			);
			return [
				{
					text: getToolsHeadline({
						topSlashCommand: toolsPreview.topSlashCommand,
						topSubagent: toolsPreview.topSubagent,
					}),
				},
				{
					text: getToolsSubline({
						slashCommandsAdoptionRate: toolsPreview.slashCommandsAdoptionRate,
						subagentsAdoptionRate: toolsPreview.subagentsAdoptionRate,
					}),
				},
			];
		}
		case "lock-in": {
			const lockInStage = resolveLockInStageModel(
				resolveLockInPreviewInput(
					{
						avgSessionMin: onboardingMetrics.avgSessionMin,
						longestSessionMin: onboardingMetrics.longestSessionMin,
					},
					previewState,
				),
			);
			return [{ text: lockInStage.headline }, { text: lockInStage.subline }];
		}
		default:
			return [{ text: "" }];
	}
}

export function resolveSkillsPreviewInput(
	input: {
		skillsAdoptionRate: number | null;
		topSkills: readonly WalkInSkillUsageItem[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "dominant":
			return {
				topSkills: [
					{ name: "Refactor", count: 42 },
					{ name: "Plan", count: 27 },
					{ name: "Test", count: 18 },
					{ name: "Review", count: 15 },
					{ name: "Explain", count: 14 },
					{ name: "Research", count: 12 },
					{ name: "Extract", count: 10 },
					{ name: "Debug", count: 8 },
					{ name: "Write Docs", count: 7 },
					{ name: "Migrate", count: 5 },
				],
				skillsAdoptionRate: 68,
			};
		case "dominant-no-rate":
			return {
				topSkills: [
					{ name: "Refactor", count: 33 },
					{ name: "Plan", count: 19 },
					{ name: "Explain", count: 14 },
					{ name: "Review", count: 12 },
					{ name: "Research", count: 10 },
					{ name: "Test", count: 8 },
					{ name: "Extract", count: 6 },
					{ name: "Summarize", count: 5 },
					{ name: "Migrate", count: 4 },
				],
				skillsAdoptionRate: null,
			};
		case "usage-no-winner":
			return {
				topSkills: [
					{ name: "Plan", count: 14 },
					{ name: "Refactor", count: 13 },
					{ name: "Research", count: 12 },
					{ name: "Review", count: 11 },
					{ name: "Test", count: 11 },
					{ name: "Explain", count: 10 },
					{ name: "Debug", count: 9 },
					{ name: "Extract", count: 9 },
					{ name: "Summarize", count: 8 },
				],
				skillsAdoptionRate: 24,
			};
		case "single-skill":
			return {
				topSkills: [{ name: "Refactor", count: 11 }],
				skillsAdoptionRate: 18,
			};
		case "no-signal":
			return { topSkills: [], skillsAdoptionRate: null };
		default:
			return input;
	}
}

export function resolveSkillsStageModel(input: {
	skillsAdoptionRate: number | null;
	topSkills: readonly WalkInSkillUsageItem[];
}) {
	const rankedSkills = input.topSkills.filter(
		(skill) => skill.name.trim().length > 0 && skill.count > 0,
	);
	const displayItems = rankedSkills.length > 0 ? [...rankedSkills] : [];

	const minimumVisibleItems = 3;
	while (displayItems.length < minimumVisibleItems) {
		displayItems.push(getSkillsPlaceholderItem(displayItems.length + 1));
	}

	const cardItems = displayItems.map((skill, index) => {
		const rank = index + 1;
		const isPlaceholder = skill.count === 0;

		return {
			id: `skill-rank-${rank}`,
			isPlaceholder,
			meta: isPlaceholder
				? getSkillsPlaceholderMeta(rank)
				: `${skill.count.toLocaleString()} use${skill.count === 1 ? "" : "s"}`,
			name: isPlaceholder ? getSkillsPlaceholderName(rank) : skill.name,
			rank,
		};
	});

	const cards = cardItems.map((item) => ({
		id: `skills-card-${item.rank}`,
		item,
	}));
	const visibleCardCount = Math.max(cards.length, SKILLS_STACK.visibleCards);
	const trackHeightRem =
		SKILLS_STACK.viewportHeightRem +
		(visibleCardCount - 1) * SKILLS_STACK.stepRem;
	const visibleSkillsCount = rankedSkills.length;
	const isScrollable = visibleSkillsCount > SKILLS_STACK.visibleCards;

	if (rankedSkills.length === 0) {
		return {
			cards,
			footnote:
				"No ranked skills yet. The board fills once the same skills start showing up more than once.",
			headline: "Your skill board is warming up",
			isScrollable,
			subline: "The first three repeat skills will stack here once the pattern settles.",
			trackHeightRem,
		};
	}

	if (rankedSkills.length === 1) {
		return {
			cards,
			footnote:
				input.skillsAdoptionRate === null
					? "Only one skill has enough signal to make the board so far."
					: `${formatPercent(input.skillsAdoptionRate)} of sessions pulled in a skill.`,
			headline: `${rankedSkills[0]?.name} took the lead`,
			isScrollable,
			subline: "The board has a leader now. The next two spots are still taking shape.",
			trackHeightRem,
		};
	}

	const leaderName = rankedSkills[0]?.name ?? "One skill";
	const footnote = isScrollable
		? `${visibleSkillsCount.toLocaleString()} skills ranked. Scroll or swipe the cards to see the full board.`
		: input.skillsAdoptionRate === null
			? "Skill adoption is still settling."
			: `${formatPercent(input.skillsAdoptionRate)} of sessions pulled in a skill.`;

	return {
		cards,
		footnote,
		headline: `${leaderName} leads the board`,
		isScrollable,
		subline: "A playful read on the skills that kept showing up.",
		trackHeightRem,
	};
}

export function clampSkillsCardIndex(index: number, totalCards: number) {
	if (totalCards <= 0) {
		return 0;
	}

	return Math.min(Math.max(index, 0), totalCards - 1);
}

export function getSkillsCardStyle(
	cardIndex: number,
	activeCardIndex: number,
): CSSProperties {
	const relativeDepth = cardIndex - activeCardIndex;
	const isVisibleDepth =
		relativeDepth >= -1 && relativeDepth < SKILLS_STACK.visibleCards - 1;
	const zIndex =
		relativeDepth === 0
			? 40
			: relativeDepth === -1
				? 30
				: relativeDepth === 1
					? 20
					: 10;

	const depthStyles =
		relativeDepth === -1
			? { rotateDeg: -7, scale: 0.968, translateZ: 16, widthPercent: 96 }
			: relativeDepth === 0
				? { rotateDeg: 0, scale: 1, translateZ: 52, widthPercent: 100 }
				: relativeDepth === 1
					? { rotateDeg: 8, scale: 0.962, translateZ: 16, widthPercent: 96 }
					: { rotateDeg: 12, scale: 0.93, translateZ: -4, widthPercent: 92 };

	return {
		"--skills-card-y": `${relativeDepth * SKILLS_STACK.stepRem}rem`,
		"--skills-card-scale": depthStyles.scale,
		"--skills-card-rotate": `${depthStyles.rotateDeg}deg`,
		"--skills-card-z": `${depthStyles.translateZ}px`,
		filter: isVisibleDepth ? "blur(0px)" : "blur(2px)",
		opacity: isVisibleDepth ? 1 : 0,
		pointerEvents: isVisibleDepth ? "auto" : "none",
		top: `${SKILLS_STACK.focusTopRem}rem`,
		width: `calc(${depthStyles.widthPercent}% - ${SKILLS_STACK.shadowBleedRem * 2}rem)`,
		zIndex,
	} as CSSProperties;
}

export function resolveRepoPulsePreviewInput(
	input: WalkInRepoPulseMetrics,
	previewState: string,
) {
	switch (previewState) {
		case "single-home":
			return {
				entries: [
					{
						id: "repo-preview-geneva",
						meta: "84 sessions · 42h total",
						proof: "52m avg session",
						repoName: "geneva",
						workType: "Deep work",
					},
				],
				leadRepoName: "geneva",
				totalRepos: 1,
				totalSessions: 84,
			} satisfies WalkInRepoPulseMetrics;
		case "split-across":
			return {
				entries: [
					{
						id: "repo-preview-geneva",
						meta: "61 sessions · 31h total",
						proof: "48m avg session",
						repoName: "geneva",
						workType: "Deep work",
					},
					{
						id: "repo-preview-rudel-web",
						meta: "28 sessions · 17h total",
						proof: "43% used skills",
						repoName: "rudel-web",
						workType: "Skills-heavy",
					},
					{
						id: "repo-preview-api-routes",
						meta: "19 sessions · 1.8M tokens",
						proof: "94K tokens / session",
						repoName: "api-routes",
						workType: "Heavy lift",
					},
				],
				leadRepoName: "geneva",
				totalRepos: 6,
				totalSessions: 108,
			} satisfies WalkInRepoPulseMetrics;
		case "quiet":
			return {
				entries: [],
				leadRepoName: null,
				totalRepos: 0,
				totalSessions: 0,
			} satisfies WalkInRepoPulseMetrics;
		default:
			return input;
	}
}

export function resolveRepoPulseStageModel(
	input: WalkInRepoPulseMetrics,
): RepoPulseStageModel {
	if (input.entries.length === 0) {
		return {
			entries: [],
			footnote: "A little more repo history and the pulse will settle into view.",
			headline: "Your repo pulse is still landing",
			subline:
				"When the work settles into projects, this view turns into repo-by-repo work types.",
			totalReposLabel: "No repo signal yet",
			totalSessionsLabel: "No sessions yet",
		};
	}

	if (input.entries.length === 1) {
		return {
			entries: input.entries,
			footnote:
				"Each label comes from the strongest signal inside that repo: tool adoption, depth, token load, or delivery.",
			headline: "One repo held onto the run",
			subline: "There was a clear home base before the final card reveal.",
			totalReposLabel: `${input.totalRepos} repo${input.totalRepos === 1 ? "" : "s"} in play`,
			totalSessionsLabel: `${input.totalSessions.toLocaleString()} sessions`,
		};
	}

	return {
		entries: input.entries,
		footnote:
			"Each label comes from the strongest signal inside that repo: tool adoption, depth, token load, or delivery.",
		headline:
			input.entries.length >= 3
				? "Each repo had its own rhythm"
				: "The work split across a couple repos",
		subline:
			input.entries.length >= 3
				? "The top repos were not interchangeable. Each one carried a different kind of work."
				: "Even the busiest repos ended up with different patterns of work.",
		totalReposLabel: `${input.totalRepos} repo${input.totalRepos === 1 ? "" : "s"} in play`,
		totalSessionsLabel: `${input.totalSessions.toLocaleString()} sessions`,
	};
}

export function resolveToolsStageModel(input: {
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommands: readonly WalkInSkillUsageItem[];
	topSlashCommandCount: number | null;
	topSubagent: string | null;
	topSubagents: readonly WalkInSkillUsageItem[];
	topSubagentCount: number | null;
	totalSessions: number;
}): ToolsStageModel {
	const liveEntries = buildToolsStageEntries(input);

	if (input.topSlashCommand === null && input.topSubagent === null) {
		return {
			entries: buildToolsPlaceholderEntries(),
			footnote:
				"These numbers are the share of sessions where each layer showed up, not raw invocation counts.",
			headline: "You stayed close to the base model",
			subline:
				"The extension layer is still quiet, so the readout stays intentionally spare.",
		};
	}

	if (input.topSlashCommand !== null && input.topSubagent !== null) {
		return {
			entries: liveEntries,
			footnote:
				"These are session-share numbers: how often that layer appeared in a session at least once.",
			headline: getToolsHeadline(input),
			subline:
				"One thing you reached for directly, one thing you handed work off to.",
		};
	}

	if (input.topSlashCommand !== null) {
		return {
			entries: liveEntries,
			footnote:
				"Session share is based on whether the layer appeared in the session, not how many times it fired.",
			headline: getToolsHeadline(input),
			subline:
				"One command pattern showed up clearly. The rest of the extension layer is still settling.",
		};
	}

	return {
		entries: liveEntries,
		footnote:
			"Session share is based on whether the layer appeared in the session, not how many times it fired.",
		headline: getToolsHeadline(input),
		subline:
			"The helper layer is visible already. Slash-command usage can stay quiet and that still tells a story.",
	};
}

export function resolveToolsPreviewInput(
	input: {
		slashCommandsAdoptionRate: number | null;
		subagentsAdoptionRate: number | null;
		topSlashCommand: string | null;
		topSlashCommands: readonly WalkInSkillUsageItem[];
		topSlashCommandCount: number | null;
		topSubagent: string | null;
		topSubagents: readonly WalkInSkillUsageItem[];
		topSubagentCount: number | null;
		totalSessions: number;
	},
	previewState: string,
) {
	switch (previewState) {
		case "both":
			return {
				topSlashCommand: "/fix",
				topSlashCommands: [
					{ name: "/fix", count: 74 },
					{ name: "/plan", count: 29 },
				],
				topSlashCommandCount: 74,
				topSubagent: "Reviewer",
				topSubagents: [{ name: "Reviewer", count: 40 }],
				topSubagentCount: 40,
				slashCommandsAdoptionRate: 58,
				subagentsAdoptionRate: 31,
				totalSessions: 128,
			};
		case "slash-only":
			return {
				topSlashCommand: "/plan",
				topSlashCommands: [
					{ name: "/plan", count: 79 },
					{ name: "/test", count: 28 },
					{ name: "/review", count: 17 },
				],
				topSlashCommandCount: 79,
				topSubagent: null,
				topSubagents: [],
				topSubagentCount: null,
				slashCommandsAdoptionRate: 62,
				subagentsAdoptionRate: null,
				totalSessions: 127,
			};
		case "subagent-only":
			return {
				topSlashCommand: null,
				topSlashCommands: [],
				topSlashCommandCount: null,
				topSubagent: "Researcher",
				topSubagents: [
					{ name: "Researcher", count: 37 },
					{ name: "Reviewer", count: 22 },
				],
				topSubagentCount: 37,
				slashCommandsAdoptionRate: null,
				subagentsAdoptionRate: 29,
				totalSessions: 128,
			};
		case "base-model":
			return {
				topSlashCommand: null,
				topSlashCommands: [],
				topSlashCommandCount: null,
				topSubagent: null,
				topSubagents: [],
				topSubagentCount: null,
				slashCommandsAdoptionRate: null,
				subagentsAdoptionRate: null,
				totalSessions: input.totalSessions,
			};
		default:
			return input;
	}
}

export function getToolsStackHeightRem(entryCount: number) {
	if (entryCount >= 3) {
		return 17.4;
	}

	if (entryCount === 2) {
		return 11.4;
	}

	return 6.9;
}

export function getToolsEntryStyle(
	entryIndex: number,
	totalEntries: number,
	activeCardIndex: number,
): CSSProperties {
	const stackOrder = [
		activeCardIndex,
		...Array.from({ length: totalEntries }, (_, index) => index).filter(
			(index) => index !== activeCardIndex,
		),
	];
	const stackLayer = Math.max(0, stackOrder.indexOf(entryIndex));
	const styles =
		totalEntries <= 1
			? {
					rotate: "-1deg",
					scale: 1,
					translateX: "-50%",
					translateY: "0rem",
					zIndex: 30,
				}
			: totalEntries === 2
				? stackLayer === 0
					? {
							rotate: "-1.25deg",
							scale: 1,
							translateX: "-50%",
							translateY: "0rem",
							zIndex: 20,
						}
					: {
							rotate: "3deg",
							scale: 0.985,
							translateX: "-49.5%",
							translateY: "4rem",
							zIndex: 10,
						}
				: stackLayer === 0
					? {
							rotate: "-1.25deg",
							scale: 1,
							translateX: "-50%",
							translateY: "0rem",
							zIndex: 30,
						}
					: stackLayer === 1
						? {
								rotate: "3deg",
								scale: 0.988,
								translateX: "-49.2%",
								translateY: "4.2rem",
								zIndex: 20,
							}
						: {
								rotate: "-3.25deg",
								scale: 0.976,
								translateX: "-50.8%",
								translateY: "8.2rem",
								zIndex: 10,
							};

	return {
		"--tools-card-rotate": styles.rotate,
		"--tools-card-scale": styles.scale,
		"--tools-card-translate-x": styles.translateX,
		"--tools-card-translate-y": styles.translateY,
		zIndex: styles.zIndex,
	} as CSSProperties;
}

export function resolveModelPreviewInput(
	input: {
		modelByMonth: readonly MonthlyModelUsage[];
		sourceSplit: readonly WrappedSourceSplit[];
	},
	previewState: string,
) {
	switch (previewState) {
		case "favorite":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 28],
					["2026-01", "GPT-4.1", 8],
					["2026-02", "Claude Sonnet 4", 25],
					["2026-02", "GPT-4.1", 6],
					["2026-03", "Claude Sonnet 4", 24],
					["2026-03", "GPT-4.1", 7],
					["2026-04", "Claude Sonnet 4", 29],
					["2026-04", "GPT-4.1", 8],
					["2026-05", "Claude Sonnet 4", 27],
					["2026-05", "GPT-4.1", 7],
					["2026-06", "Claude Sonnet 4", 31],
					["2026-06", "GPT-4.1", 9],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 78],
					["codex", 22],
				]),
			};
		case "played-field":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 14],
					["2026-01", "GPT-4.1", 13],
					["2026-01", "Gemini 2.5 Pro", 11],
					["2026-02", "GPT-4.1", 15],
					["2026-02", "Claude Sonnet 4", 14],
					["2026-02", "Gemini 2.5 Pro", 12],
					["2026-03", "Gemini 2.5 Pro", 13],
					["2026-03", "Claude Sonnet 4", 12],
					["2026-03", "GPT-4.1", 12],
					["2026-04", "Claude Sonnet 4", 16],
					["2026-04", "GPT-4.1", 15],
					["2026-04", "Gemini 2.5 Pro", 12],
					["2026-05", "GPT-4.1", 14],
					["2026-05", "Claude Sonnet 4", 13],
					["2026-05", "Gemini 2.5 Pro", 13],
					["2026-06", "Claude Sonnet 4", 15],
					["2026-06", "GPT-4.1", 15],
					["2026-06", "Gemini 2.5 Pro", 11],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 51],
					["codex", 49],
				]),
			};
		case "single-switch":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 22],
					["2026-01", "GPT-4.1", 8],
					["2026-02", "Claude Sonnet 4", 18],
					["2026-02", "GPT-4.1", 7],
					["2026-03", "GPT-4.1", 25],
					["2026-03", "Claude Sonnet 4", 11],
					["2026-04", "GPT-4.1", 29],
					["2026-04", "Claude Sonnet 4", 9],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 42],
					["codex", 58],
				]),
			};
		case "exploring":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 12],
					["2026-02", "GPT-4.1", 17],
					["2026-02", "Claude Sonnet 4", 14],
					["2026-03", "Gemini 2.5 Pro", 15],
					["2026-03", "Claude Sonnet 4", 11],
					["2026-04", "Claude Sonnet 4", 19],
					["2026-04", "GPT-4.1", 14],
					["2026-05", "GPT-4.1", 16],
					["2026-05", "Gemini 2.5 Pro", 13],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 55],
					["codex", 45],
				]),
			};
		case "settled":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 11],
					["2026-02", "Claude Sonnet 4", 19],
					["2026-02", "GPT-4.1", 12],
					["2026-03", "GPT-4.1", 21],
					["2026-03", "Claude Sonnet 4", 14],
					["2026-04", "GPT-4.1", 22],
					["2026-04", "Claude Sonnet 4", 13],
					["2026-05", "Claude Sonnet 4", 17],
					["2026-05", "GPT-4.1", 18],
					["2026-06", "GPT-4.1", 24],
					["2026-06", "Claude Sonnet 4", 14],
					["2026-07", "GPT-4.1", 26],
					["2026-07", "Claude Sonnet 4", 11],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 39],
					["codex", 61],
				]),
			};
		case "rotation":
			return {
				modelByMonth: buildPreviewMonthlyModelUsage([
					["2026-01", "Claude Sonnet 4", 18],
					["2026-01", "GPT-4.1", 12],
					["2026-02", "Claude Sonnet 4", 21],
					["2026-02", "GPT-4.1", 9],
					["2026-03", "GPT-4.1", 19],
					["2026-03", "Claude Sonnet 4", 16],
					["2026-04", "GPT-4.1", 17],
					["2026-04", "Claude Sonnet 4", 15],
					["2026-05", "Claude Sonnet 4", 22],
					["2026-05", "GPT-4.1", 11],
					["2026-06", "Claude Sonnet 4", 24],
					["2026-06", "GPT-4.1", 10],
				]),
				sourceSplit: buildPreviewSourceSplit([
					["claude_code", 57],
					["codex", 43],
				]),
			};
		default:
			return input;
	}
}

export function resolveModelStageModel(input: {
	modelByMonth: readonly MonthlyModelUsage[];
	sourceSplit: readonly WrappedSourceSplit[];
}): ModelStageModel {
	const months = buildModelShareMonths(input.modelByMonth);
	const summary = buildModelShareSummary(input.sourceSplit);
	const sourceSplit = summarizeModelSourceSplit(summary);
	const activeMonths = months.filter((month) => month.totalSessions > 0);
	const distinctLeaders = new Set(
		activeMonths.map((month) => month.leaderLabel),
	).size;
	const latestLeader = activeMonths[activeMonths.length - 1]?.leaderLabel ?? null;
	const earliestLeader = activeMonths[0]?.leaderLabel ?? null;
	const overallLeader = sourceSplit.leadingLabel ?? latestLeader;
	const headline =
		summary.length === 0 && activeMonths.length === 0
			? "Your Claude vs Codex split is warming up"
			: sourceSplit.isBalanced
				? "You kept both tools in play"
				: distinctLeaders <= 1 && overallLeader
					? `${overallLeader} held the line`
					: earliestLeader && latestLeader && earliestLeader !== latestLeader
						? `${latestLeader} took the latest stretch`
						: overallLeader
							? `${overallLeader} led the run`
							: "Your tool split kept moving";
	const subline =
		summary.length === 0 && activeMonths.length === 0
			? "We will chart Claude and Codex once enough history lands."
			: activeMonths.length === 0
				? "The full-run split is ready. The month-by-month view needs a little more history."
				: sourceSplit.isBalanced
					? "The all-time bar stayed close, and the monthly stacks kept both tools in rotation."
					: earliestLeader && latestLeader && earliestLeader !== latestLeader
						? `${earliestLeader} led early, then ${latestLeader} took the latest month.`
						: overallLeader
							? `The full-run bar and the monthly stacks both leaned ${overallLeader}.`
							: "The top bar shows the full-run split. The six stacks show how it moved month to month.";
	const totalSessions = summary.reduce(
		(sum, segment) => sum + segment.sessionCount,
		0,
	);

	return {
		footnote:
			"Top bar uses the entire run. The six monthly stacks collapse model history into Claude vs Codex.",
		headline,
		months,
		monthsLabel: `${activeMonths.length} active month${activeMonths.length === 1 ? "" : "s"}`,
		subline,
		summary,
		totalSessionsLabel:
			totalSessions > 0
				? `${totalSessions.toLocaleString()} sessions`
				: "No sessions yet",
	};
}

export function formatModelStageSourceLabel(
	source: WrappedSourceSplit["source"],
) {
	return source === "claude_code" ? "Claude" : "Codex";
}

export function getModelStageTone(source: WrappedSourceSplit["source"]) {
	return MODEL_STAGE_TONES[source];
}

export function resolveScalePreviewTokens(
	totalTokens: number,
	previewState: string,
) {
	switch (previewState) {
		case "missing":
			return 0;
		case "essay":
			return 60_000;
		case "novella":
			return 220_000;
		case "novels":
			return 2_400_000;
		case "war-and-peace":
			return 12_400_000;
		default:
			return totalTokens;
	}
}

export function resolveScaleStageModel(totalTokens: number): ScaleStageModel {
	if (totalTokens <= 0) {
		return {
			displayBallCount: 0,
			footnote:
				"The rain uses a compressed visual scale so large token totals still fit inside one phone-sized story page.",
			headline: "Your token pile is still warming up",
			showsMinimumFloor: false,
			subline:
				"Once tokens land, the whole page turns into a token shower instead of another raw metric card.",
			totalTokens,
		};
	}

	const { displayBallCount, showsMinimumFloor } =
		getScaleBallCountSummary(totalTokens);
	const headline =
		totalTokens >= 10_000_000
			? "The token pile got absurd"
			: totalTokens >= 1_000_000
				? "The token pile got heavy"
				: totalTokens >= 200_000
					? "The token pile started stacking up"
					: "The token pile is getting started";
	const subline = showsMinimumFloor
		? "Even smaller totals get the same visual floor, so the page still fills with rain instead of a stub."
		: "Ball count compresses the total so the rain reads at a glance instead of as another metric card.";

	return {
		displayBallCount,
		footnote:
			"Each ball stands in for a chunk of tokens, not a single session. The count is compressed to keep the full-screen shower readable.",
		headline,
		showsMinimumFloor,
		subline,
		totalTokens,
	};
}

export function buildScaleRainBalls(totalTokens: number): ScaleRainBall[] {
	const { displayBallCount } = getScaleBallCountSummary(totalTokens);
	if (displayBallCount <= 0) {
		return [];
	}

	const visibleBallCount = Math.min(displayBallCount, 72);
	const random = createScaleRainSeededRandom(
		Math.max(1, Math.floor(totalTokens)),
	);
	const columnCount = Math.min(
		16,
		Math.max(6, Math.ceil(Math.sqrt(visibleBallCount * 1.25))),
	);
	const rowCount = Math.ceil(visibleBallCount / columnCount);

	return Array.from({ length: visibleBallCount }, (_, index) => {
		const lane = index % columnCount;
		const row = Math.floor(index / columnCount);
		const laneCenter = (lane + 0.5) / columnCount;
		const laneJitter = (random() - 0.5) * (0.72 / columnCount);
		const leftPercent = clampNumber((laneCenter + laneJitter) * 100, 4, 96);
		const sizePx = Math.round(
			24 + random() * 28 + (1 - row / Math.max(rowCount, 1)) * 10,
		);
		const tintBand = index % 5;
		const hue =
			tintBand <= 3
				? 28 + random() * 14
				: 214 + random() * 16;

		return {
			delayMs: Math.round(random() * 3000 + row * 120 + lane * 32),
			driftPx: Math.round((random() - 0.5) * Math.max(56, 132 - row * 5)),
			durationMs: Math.round(3600 + random() * 1900 + row * 85),
			endRotationDeg: (random() - 0.5) * 56,
			hue,
			id: `scale-rain-ball-${index}`,
			leftPercent,
			sizePx,
			startRotationDeg: (random() - 0.5) * 120,
			startYOffsetPx: Math.round(72 + random() * 160 + row * 26),
			staticTopSvh: clampNumber(12 + row * 8 + random() * 10, 10, 82),
			zIndex: 8 + row,
		} satisfies ScaleRainBall;
	});
}

export function getScaleRainBallStyle(ball: ScaleRainBall): CSSProperties {
	return {
		"--scale-rain-ball-delay": `${ball.delayMs}ms`,
		"--scale-rain-ball-drift-end": `${ball.driftPx}px`,
		"--scale-rain-ball-drift-start": `${Math.round(ball.driftPx * -0.35)}px`,
		"--scale-rain-ball-duration": `${ball.durationMs}ms`,
		"--scale-rain-ball-end-rotation": `${ball.endRotationDeg}deg`,
		"--scale-rain-ball-start-rotation": `${ball.startRotationDeg}deg`,
		"--scale-rain-ball-start-y": `${-ball.startYOffsetPx}px`,
		"--scale-rain-ball-static-y": `${ball.staticTopSvh}svh`,
		height: `${ball.sizePx}px`,
		left: `${ball.leftPercent}%`,
		marginLeft: `${-ball.sizePx / 2}px`,
		width: `${ball.sizePx}px`,
		zIndex: ball.zIndex,
	} as CSSProperties;
}

export function getScaleRainBallCoreStyle(ball: ScaleRainBall): CSSProperties {
	const fillLightness = ball.hue < 120 ? "82%" : "84%";

	return {
		backgroundColor: `hsl(${ball.hue} 56% ${fillLightness})`,
		border: "1px solid rgba(255, 255, 255, 0.42)",
	};
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
		avgSessionMin !== null ? formatDurationMinutes(avgSessionMin) : "No average yet";
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
		longestShare: getLockInStageShare(
			longestSessionMin,
			comparisonMaxDuration,
		),
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

export function formatCompactNumber(value: number) {
	return COMPACT_NUMBER_FORMATTER.format(value);
}

function getSkillsPlaceholderName(rank: number) {
	if (rank <= 3) {
		return `Future pick ${rank}`;
	}
	if (rank <= 6) {
		return "Next contender";
	}
	return "Still forming";
}

function getSkillsPlaceholderMeta(rank: number) {
	if (rank <= 3) {
		return "Still warming up";
	}
	if (rank <= 6) {
		return "Waiting for repeat use";
	}
	return "One more run to get there";
}

function getSkillsPlaceholderItem(rank: number): WalkInSkillUsageItem {
	return {
		count: 0,
		name: `placeholder-${rank}`,
	};
}

function getToolsUsageLabel(rate: number, count: number | null) {
	if (count === null) {
		return `Used in ${formatPercent(rate)} of sessions`;
	}

	return `Used in ${formatPercent(rate)} of sessions (${count.toLocaleString()} ${
		count === 1 ? "time" : "times"
	})`;
}

function buildToolsStageEntries(input: {
	topSlashCommands: readonly WalkInSkillUsageItem[];
	topSubagents: readonly WalkInSkillUsageItem[];
	totalSessions: number;
}): readonly ToolsStageEntry[] {
	const totalSessions = Math.max(input.totalSessions, 0);
	const slashEntries = input.topSlashCommands.map((item, index) => ({
		count: item.count,
		id: `slash-command-${index}`,
		name: item.name,
	}));
	const subagentEntries = input.topSubagents.map((item, index) => ({
		count: item.count,
		id: `subagent-${index}`,
		name: item.name,
	}));

	return [...slashEntries, ...subagentEntries]
		.filter((item) => item.name.trim().length > 0 && item.count > 0)
		.sort(
			(leftItem, rightItem) =>
				rightItem.count - leftItem.count ||
				leftItem.name.localeCompare(rightItem.name),
		)
		.slice(0, 3)
		.map((item) => ({
			id: item.id,
			isPlaceholder: false,
			name: item.name,
			usageLabel: getToolsUsageLabel(
				totalSessions > 0 ? (item.count / totalSessions) * 100 : 0,
				item.count,
			),
			usageRate: totalSessions > 0 ? (item.count / totalSessions) * 100 : 0,
		}));
}

function buildToolsPlaceholderEntries(): readonly ToolsStageEntry[] {
	return [
		{
			id: "tools-placeholder-1",
			isPlaceholder: true,
			name: "Waiting for a repeat winner",
			usageLabel: "Session share still landing",
			usageRate: null,
		},
		{
			id: "tools-placeholder-2",
			isPlaceholder: true,
			name: "Still forming",
			usageLabel: "Nothing ranked yet",
			usageRate: null,
		},
	] as const;
}

function buildPreviewMonthlyModelUsage(
	entries: readonly [string, string, number][],
): MonthlyModelUsage[] {
	return entries.map(([month, model, sessionCount]) => ({
		month,
		model,
		session_count: sessionCount,
	}));
}

function buildPreviewSourceSplit(
	entries: readonly [WrappedSourceSplit["source"], number][],
): WrappedSourceSplit[] {
	return entries.map(([source, sessionSharePercent]) => ({
		source,
		session_count: Math.round(sessionSharePercent),
		session_share_percent: sessionSharePercent,
	}));
}

function buildModelShareMonths(
	modelByMonth: readonly MonthlyModelUsage[],
): WalkInModelShareMonth[] {
	const rowsByMonth = buildModelSourceCountsByMonth(modelByMonth);
	const months = getLatestModelStageMonthKeys([...rowsByMonth.keys()]);

	if (months.length === 0) {
		return [];
	}

	return months.map((month) => {
		const monthCounts = rowsByMonth.get(month) ?? new Map();
		const sourceCounts = MODEL_STAGE_SOURCE_ORDER.map((source) => ({
			label: formatModelStageSourceLabel(source),
			sessionCount: monthCounts.get(source) ?? 0,
			source,
		}));
		const totalSessions = sourceCounts.reduce(
			(sum, sourceEntry) => sum + sourceEntry.sessionCount,
			0,
		);
		const leader = [...sourceCounts].sort(
			(leftEntry, rightEntry) =>
				rightEntry.sessionCount - leftEntry.sessionCount ||
				leftEntry.label.localeCompare(rightEntry.label),
		)[0];
		const segments = sourceCounts.flatMap((sourceEntry) =>
			sourceEntry.sessionCount > 0
				? [
						{
							id: `${month}:${sourceEntry.source}`,
							label: sourceEntry.label,
							sessionCount: sourceEntry.sessionCount,
							share: (sourceEntry.sessionCount / totalSessions) * 100,
							source: sourceEntry.source,
						},
					]
				: [],
		);

		if (totalSessions <= 0) {
			return {
				id: `model-month-${month}`,
				label: formatMonthTickLabel(month),
				leaderLabel: "No activity",
				leaderShare: 0,
				segments: [],
				totalSessions: 0,
			};
		}

		return {
			id: `model-month-${month}`,
			label: formatMonthTickLabel(month),
			leaderLabel: leader?.label ?? "No activity",
			leaderShare: Math.round(
				((leader?.sessionCount ?? 0) / totalSessions) * 100,
			),
			segments,
			totalSessions,
		};
	});
}

function buildModelShareSummary(
	sourceSplit: readonly WrappedSourceSplit[],
): WalkInModelShareSegment[] {
	const summaryRows = MODEL_STAGE_SOURCE_ORDER.map((source) => ({
		label: formatModelStageSourceLabel(source),
		sessionCount:
			sourceSplit.find((sourceEntry) => sourceEntry.source === source)
				?.session_count ?? 0,
		sessionShare:
			sourceSplit.find((sourceEntry) => sourceEntry.source === source)
				?.session_share_percent ?? 0,
		source,
	})).filter(
		(sourceEntry) =>
			sourceEntry.sessionCount > 0 || sourceEntry.sessionShare > 0,
	);

	if (summaryRows.length === 0) {
		return [];
	}

	const totalSessions = summaryRows.reduce(
		(sum, sourceEntry) => sum + sourceEntry.sessionCount,
		0,
	);

	return summaryRows.map((sourceEntry) => ({
		id: `model-summary-${sourceEntry.source}`,
		label: sourceEntry.label,
		sessionCount: sourceEntry.sessionCount,
		share:
			totalSessions > 0
				? (sourceEntry.sessionCount / totalSessions) * 100
				: sourceEntry.sessionShare,
		source: sourceEntry.source,
	}));
}

function buildModelSourceCountsByMonth(
	modelByMonth: readonly MonthlyModelUsage[],
) {
	const rowsByMonth = new Map<string, Map<WrappedSourceSplit["source"], number>>();

	for (const row of modelByMonth) {
		const source = resolveModelStageSource(row.model);
		if (!source || row.session_count <= 0) {
			continue;
		}

		const monthCounts = rowsByMonth.get(row.month) ?? new Map();
		monthCounts.set(source, (monthCounts.get(source) ?? 0) + row.session_count);
		rowsByMonth.set(row.month, monthCounts);
	}

	return rowsByMonth;
}

function getLatestModelStageMonthKeys(months: readonly string[]) {
	const uniqueMonths = [...new Set(months)].sort();
	const latestMonth = uniqueMonths[uniqueMonths.length - 1];
	if (!latestMonth) {
		return [];
	}

	const [yearPart, monthPart] = latestMonth.split("-");
	const monthIndex = Number(monthPart) - 1;
	if (!yearPart || !monthPart || Number.isNaN(monthIndex)) {
		return uniqueMonths.slice(-6);
	}

	const latestDate = new Date(Date.UTC(Number(yearPart), monthIndex, 1));
	if (Number.isNaN(latestDate.getTime())) {
		return uniqueMonths.slice(-6);
	}

	return Array.from({ length: 6 }, (_, index) => {
		const date = new Date(latestDate);
		date.setUTCMonth(date.getUTCMonth() - (5 - index));
		return [
			date.getUTCFullYear().toString(),
			String(date.getUTCMonth() + 1).padStart(2, "0"),
		].join("-");
	});
}

function summarizeModelSourceSplit(summary: readonly WalkInModelShareSegment[]) {
	const claudeShare = Math.round(
		summary.find((segment) => segment.source === "claude_code")?.share ?? 0,
	);
	const codexShare = Math.round(
		summary.find((segment) => segment.source === "codex")?.share ?? 0,
	);
	const rankedSegments = [...summary].sort(
		(leftSegment, rightSegment) =>
			rightSegment.share - leftSegment.share ||
			leftSegment.label.localeCompare(rightSegment.label),
	);

	return {
		claudeShare,
		codexShare,
		hasSignal: claudeShare > 0 || codexShare > 0,
		isBalanced: Math.abs(claudeShare - codexShare) <= 8,
		leadingLabel: rankedSegments[0]?.label ?? null,
	};
}

function resolveModelStageSource(
	model: string | null | undefined,
): WrappedSourceSplit["source"] | null {
	const modelLabel = formatModelLabel(model)?.toLowerCase();
	if (!modelLabel) {
		return null;
	}

	return modelLabel.includes("claude") ? "claude_code" : "codex";
}

function formatMonthTickLabel(month: string) {
	const [year, monthPart] = month.split("-");
	if (!year || !monthPart) {
		return month;
	}

	const monthIndex = Number(monthPart) - 1;
	if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
		return month;
	}

	const date = new Date(Date.UTC(Number(year), monthIndex, 1));
	return date.toLocaleString("en", { month: "short" });
}

function clampNumber(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function createScaleRainSeededRandom(seed: number) {
	let state = seed % 2147483647;

	if (state <= 0) {
		state += 2147483646;
	}

	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
}

function getScaleBallCountSummary(totalTokens: number) {
	if (totalTokens <= 0) {
		return {
			displayBallCount: 0,
			showsMinimumFloor: false,
		};
	}

	const computedBallCount = Math.max(
		1,
		Math.round(totalTokens / SCALE_STAGE_TOKENS_PER_BALL),
	);
	const showsMinimumFloor = computedBallCount < SCALE_STAGE_MIN_BALL_COUNT;

	return {
		displayBallCount: showsMinimumFloor
			? SCALE_STAGE_MIN_BALL_COUNT
			: computedBallCount,
		showsMinimumFloor,
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
	const { avgSessionMin, longestDurationLabel, overrunMin, ratio, state } = input;
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

function formatModelLabel(value: string | null | undefined) {
	const trimmed = value?.trim();
	if (!trimmed || trimmed.toLowerCase() === "unknown") {
		return null;
	}
	return trimmed;
}

function buildScaleContent(totalTokens: number): WalkInStepContentLine[] {
	if (totalTokens <= 0) {
		return [
			{ text: "Token count is still catching up." },
			{ text: "Come back once the ingest finishes." },
		];
	}

	const headline = `${formatCompactNumber(totalTokens)} tokens.`;

	if (totalTokens >= 10_000_000) {
		const warAndPeaceCount = Math.round(totalTokens / 775_000);
		return [
			{ text: headline },
			{ text: `That's War and Peace, ${warAndPeaceCount} times over.` },
		];
	}
	if (totalTokens >= 1_000_000) {
		const novelCount = Math.max(1, Math.round(totalTokens / 100_000));
		return [{ text: headline }, { text: `About ${novelCount} novels' worth.` }];
	}
	if (totalTokens >= 100_000) {
		return [{ text: headline }, { text: "A novella's worth." }];
	}
	return [{ text: headline }, { text: "A long essay's worth." }];
}

function formatDurationMinutes(minutes: number) {
	if (minutes < 60) {
		return `${Math.round(minutes)} min`;
	}
	const hours = Math.floor(minutes / 60);
	const remaining = Math.round(minutes - hours * 60);
	if (remaining === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${remaining}m`;
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

function getToolsHeadline(input: {
	topSlashCommand: string | null;
	topSubagent: string | null;
}) {
	const { topSlashCommand, topSubagent } = input;

	if (topSlashCommand && topSubagent) {
		return `${topSlashCommand} up front. ${topSubagent} in reserve.`;
	}

	if (topSlashCommand) {
		return `${topSlashCommand} led the workflow.`;
	}

	if (topSubagent) {
		return `${topSubagent} carried the extra work.`;
	}

	return "You stayed close to the base model.";
}

function getToolsSubline(input: {
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
}) {
	const { slashCommandsAdoptionRate, subagentsAdoptionRate } = input;

	if (slashCommandsAdoptionRate === null && subagentsAdoptionRate === null) {
		return "Extension signal is still landing.";
	}

	if (slashCommandsAdoptionRate === null) {
		return `${formatPercent(subagentsAdoptionRate)} of sessions used a subagent.`;
	}

	if (subagentsAdoptionRate === null) {
		return `${formatPercent(slashCommandsAdoptionRate)} of sessions used a slash command.`;
	}

	return `${formatPercent(slashCommandsAdoptionRate)} slash-command sessions. ${formatPercent(subagentsAdoptionRate)} subagent sessions.`;
}

function formatPercent(value: number | null) {
	if (value === null) {
		return "0%";
	}

	return `${Math.round(value)}%`;
}
