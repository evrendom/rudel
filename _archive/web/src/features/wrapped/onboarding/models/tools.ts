import type { CSSProperties } from "react";
import { formatPercent } from "../format";
import type { WrappedSkillUsageItem } from "../types";
import {
	hasWrappedLowFeatureUsageSignal,
	hasWrappedRecapFeatureSignal,
	MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE,
} from "./feature-signal";

interface ToolsStageEntry {
	id: string;
	isPlaceholder: boolean;
	name: string;
	usageLabel: string;
	usageRate: number | null;
}

type ToolsStageMode =
	| "base-model"
	| "regular"
	| "thin-slash-command"
	| "zero-slash-command";

export function resolveToolsStageModel(input: {
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
	topSlashCommandCount: number | null;
	topSubagent: string | null;
	topSubagents: readonly WrappedSkillUsageItem[];
	topSubagentCount: number | null;
	totalSessions: number;
}) {
	const topSlashCommand = resolveRecapSlashCommand(input);
	const mode = resolveToolsStageMode(input, topSlashCommand);
	const liveEntries = buildToolsStageEntries(input);

	if (mode === "zero-slash-command") {
		return {
			entries: buildToolsPlaceholderEntries(),
			footnote: "No slash commands made the recap.",
			headline: "You used no slash commands.",
			mode,
			subline: "No slash commands made the recap.",
			topSlashCommand,
			topSubagent: input.topSubagent,
		};
	}

	if (mode === "thin-slash-command") {
		const thinSlashCommandSubline = `Use slash commands in +${MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE}% of sessions for a recap.`;

		return {
			entries: buildToolsPlaceholderEntries(),
			footnote: thinSlashCommandSubline,
			headline: "You didn't use slash commands enough.",
			mode,
			subline: thinSlashCommandSubline,
			topSlashCommand,
			topSubagent: input.topSubagent,
		};
	}

	if (topSlashCommand === null && input.topSubagent === null) {
		return {
			entries: buildToolsPlaceholderEntries(),
			footnote: "You should try them out tho: slash commands and subagents.",
			headline: "Just vibes.",
			mode,
			subline: "You should try them out tho: slash commands and subagents.",
			topSlashCommand,
			topSubagent: input.topSubagent,
		};
	}

	if (topSlashCommand !== null && input.topSubagent !== null) {
		return {
			entries: liveEntries,
			footnote:
				"These are session-share numbers: how often that layer appeared in a session at least once.",
			headline: getToolsHeadline(input),
			mode,
			subline: getToolsSubline(input),
			topSlashCommand,
			topSubagent: input.topSubagent,
		};
	}

	if (topSlashCommand !== null) {
		return {
			entries: liveEntries,
			footnote:
				"Session share is based on whether the layer appeared in the session, not how many times it fired.",
			headline: getToolsHeadline(input),
			mode,
			subline: getToolsSubline(input),
			topSlashCommand,
			topSubagent: input.topSubagent,
		};
	}

	return {
		entries: liveEntries,
		footnote:
			"Session share is based on whether the layer appeared in the session, not how many times it fired.",
		headline: getToolsHeadline(input),
		mode,
		subline: getToolsSubline(input),
		topSlashCommand,
		topSubagent: input.topSubagent,
	};
}

export function resolveToolsPreviewInput(
	input: {
		slashCommandsAdoptionRate: number | null;
		subagentsAdoptionRate: number | null;
		topSlashCommand: string | null;
		topSlashCommands: readonly WrappedSkillUsageItem[];
		topSlashCommandCount: number | null;
		topSubagent: string | null;
		topSubagents: readonly WrappedSkillUsageItem[];
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
		return 14.4;
	}

	if (entryCount === 2) {
		return 9.8;
	}

	return 6.5;
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
							translateY: "3.55rem",
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
								translateY: "3.65rem",
								zIndex: 20,
							}
						: {
								rotate: "-3.25deg",
								scale: 0.976,
								translateX: "-50.8%",
								translateY: "7.1rem",
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

export function getToolsHeadline(input: {
	slashCommandsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommandCount: number | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
	topSubagent: string | null;
}) {
	const topSlashCommand = resolveRecapSlashCommand(input);
	const { topSubagent } = input;

	if (topSlashCommand && topSubagent) {
		return `${topSlashCommand} led. ${topSubagent} backed it up.`;
	}

	if (topSlashCommand) {
		return `${topSlashCommand} was your go-to command.`;
	}

	if (topSubagent) {
		return `${topSubagent} became your go-to subagent.`;
	}

	return "Just vibes.";
}

export function getToolsSubline(input: {
	slashCommandsAdoptionRate: number | null;
	subagentsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommandCount: number | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
	topSubagent: string | null;
}) {
	const { slashCommandsAdoptionRate, subagentsAdoptionRate } = input;
	const topSlashCommand = resolveRecapSlashCommand(input);
	const hasLowSlashCommandSignal = isThinSlashCommandSignal(input);
	const hasSubagent = input.topSubagent !== null;

	if (topSlashCommand === null && !hasSubagent) {
		return hasLowSlashCommandSignal
			? `Use slash commands in +${MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE}% of sessions for a recap.`
			: "You should try them out tho: slash commands and subagents.";
	}

	if (topSlashCommand === null) {
		const slashCommandLine = hasLowSlashCommandSignal
			? `Use slash commands in +${MIN_WRAPPED_RECAP_FEATURE_ADOPTION_RATE}% of sessions for a recap.`
			: "No slash command ranked yet.";

		return `${formatPercent(subagentsAdoptionRate)} of sessions used a subagent. ${slashCommandLine}`;
	}

	if (!hasSubagent) {
		return `${formatPercent(slashCommandsAdoptionRate)} of sessions used a slash command. No subagent ranked yet.`;
	}

	return `${formatPercent(slashCommandsAdoptionRate)} used a slash command. ${formatPercent(subagentsAdoptionRate)} used a subagent.`;
}

function getToolsUsageLabel(rate: number) {
	return `${formatPercent(rate)} of sessions`;
}

function buildToolsStageEntries(input: {
	slashCommandsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommandCount: number | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
	topSubagents: readonly WrappedSkillUsageItem[];
	totalSessions: number;
}): readonly ToolsStageEntry[] {
	const totalSessions = Math.max(input.totalSessions, 0);
	const slashEntries =
		resolveRecapSlashCommand(input) === null
			? []
			: input.topSlashCommands.map((item, index) => ({
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
			),
			usageRate: totalSessions > 0 ? (item.count / totalSessions) * 100 : 0,
		}));
}

function buildToolsPlaceholderEntries(): readonly ToolsStageEntry[] {
	return [
		{
			id: "tools-placeholder-1",
			isPlaceholder: true,
			name: "Solo mode",
			usageLabel: "Zero side quests",
			usageRate: null,
		},
	] as const;
}

function resolveToolsStageMode(
	input: {
		slashCommandsAdoptionRate: number | null;
		topSlashCommand: string | null;
		topSlashCommandCount: number | null;
		topSlashCommands: readonly WrappedSkillUsageItem[];
		topSubagent: string | null;
	},
	topSlashCommand: string | null,
): ToolsStageMode {
	if (topSlashCommand !== null) {
		return "regular";
	}

	if (isZeroSlashCommandSignal(input)) {
		return "zero-slash-command";
	}

	if (isThinSlashCommandSignal(input)) {
		return "thin-slash-command";
	}

	if (input.topSubagent !== null) {
		return "regular";
	}

	return "base-model";
}

function resolveRecapSlashCommand(input: {
	slashCommandsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommandCount: number | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
}) {
	if (input.topSlashCommand === null) {
		return null;
	}

	if (
		!hasWrappedRecapFeatureSignal({
			adoptionRate: input.slashCommandsAdoptionRate,
			topItemCount: resolveSlashCommandTopItemCount(input),
		})
	) {
		return null;
	}

	return input.topSlashCommand;
}

function isThinSlashCommandSignal(input: {
	slashCommandsAdoptionRate: number | null;
	topSlashCommand: string | null;
	topSlashCommandCount: number | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
}) {
	return (
		input.topSlashCommand !== null &&
		hasWrappedLowFeatureUsageSignal({
			adoptionRate: input.slashCommandsAdoptionRate,
			topItemCount: resolveSlashCommandTopItemCount(input),
		}) &&
		!hasWrappedRecapFeatureSignal({
			adoptionRate: input.slashCommandsAdoptionRate,
			topItemCount: resolveSlashCommandTopItemCount(input),
		})
	);
}

function isZeroSlashCommandSignal(input: {
	slashCommandsAdoptionRate: number | null;
	topSlashCommand: string | null;
}) {
	return (
		input.topSlashCommand === null && input.slashCommandsAdoptionRate === 0
	);
}

function resolveSlashCommandTopItemCount(input: {
	topSlashCommand: string | null;
	topSlashCommandCount: number | null;
	topSlashCommands: readonly WrappedSkillUsageItem[];
}) {
	const matchedTopCommand =
		input.topSlashCommand === null
			? null
			: input.topSlashCommands.find(
					(item) => item.name === input.topSlashCommand,
				);

	if (matchedTopCommand !== null && matchedTopCommand !== undefined) {
		return Math.max(0, matchedTopCommand.count);
	}

	if (input.topSlashCommandCount !== null) {
		return Math.max(0, input.topSlashCommandCount);
	}

	const firstRankedCommand = input.topSlashCommands[0];

	if (firstRankedCommand !== undefined) {
		return Math.max(0, firstRankedCommand.count);
	}

	return input.topSlashCommand === null ? 0 : null;
}
