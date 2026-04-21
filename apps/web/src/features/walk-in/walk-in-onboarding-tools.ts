import type { CSSProperties } from "react";
import { formatPercent } from "./walk-in-onboarding-format";
import type { WalkInSkillUsageItem } from "./walk-in-onboarding-types";

interface ToolsStageEntry {
	id: string;
	isPlaceholder: boolean;
	name: string;
	usageLabel: string;
	usageRate: number | null;
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
}) {
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

export function getToolsHeadline(input: {
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

export function getToolsSubline(input: {
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
