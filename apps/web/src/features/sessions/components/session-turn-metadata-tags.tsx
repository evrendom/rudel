import { TraceWrenchIcon } from "@/components/conversation/conversation-trace-hugeicons";
import { cn } from "@/lib/utils";
import type { SessionTurnMetrics } from "./session-turn-metadata";

const turnTagClassName =
	"inline-flex min-w-0 max-w-full items-center rounded-full bg-(--session-overview-hover) px-2 py-0.5 text-xs leading-4 font-medium tracking-[-0.01em] text-(--session-overview-muted) group-aria-pressed:bg-(--session-overview-surface)";

export type SessionTurnMetadataTagKind =
	| "cost"
	| "errors"
	| "files"
	| "input"
	| "output"
	| "skills"
	| "tools";

const DEFAULT_VISIBLE_TAGS: readonly SessionTurnMetadataTagKind[] = [
	"input",
	"output",
	"cost",
	"errors",
	"tools",
	"files",
	"skills",
];

const turnCostFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

function formatCompactTurnTokens(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}
	if (value < 1_000_000) {
		return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	}
	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

export function SessionTurnCharacterCountTag({
	characterCount,
	className,
}: {
	characterCount: number;
	className?: string;
}) {
	const characterLabel = `${characterCount.toLocaleString()} ${characterCount === 1 ? "char" : "chars"}`;

	return (
		<div className={cn("mt-2 flex min-w-0 flex-wrap gap-1", className)}>
			<span
				className={turnTagClassName}
				title={`${characterCount.toLocaleString()} ${characterCount === 1 ? "character" : "characters"} in this member message`}
			>
				{characterLabel}
			</span>
		</div>
	);
}

export function SessionTurnMetadataTags({
	className,
	maxVisibleSkills,
	metrics,
	toolCallCount,
	visibleTags = DEFAULT_VISIBLE_TAGS,
}: {
	className?: string;
	maxVisibleSkills?: number;
	metrics: SessionTurnMetrics;
	toolCallCount: number;
	visibleTags?: readonly SessionTurnMetadataTagKind[];
}) {
	const inputTokenLabel =
		metrics.inputTokens === undefined
			? "IN —"
			: `IN ${formatCompactTurnTokens(metrics.inputTokens)} tok`;
	const outputTokenLabel =
		metrics.outputTokens === undefined
			? "OUT —"
			: `OUT ${formatCompactTurnTokens(metrics.outputTokens)} tok`;
	const costLabel =
		metrics.estimatedCost === undefined
			? "Cost —"
			: turnCostFormatter.format(metrics.estimatedCost);
	const errorLabel = `${metrics.errorCount.toLocaleString()} ${metrics.errorCount === 1 ? "error" : "errors"}`;
	const editedFilesLabel = `${metrics.editedFiles.length.toLocaleString()} ${metrics.editedFiles.length === 1 ? "file edited" : "files edited"}`;

	return (
		<div
			className={cn("mt-2 flex min-w-0 flex-wrap gap-1", className)}
			data-session-turn-metadata-tags
		>
			{visibleTags.includes("input") ? (
				<span
					className={turnTagClassName}
					data-session-turn-tag-kind="input"
					title={
						metrics.inputTokens === undefined
							? "Input token usage not recorded for this turn"
							: `${metrics.inputTokens.toLocaleString()} input tokens`
					}
				>
					{inputTokenLabel}
				</span>
			) : null}
			{visibleTags.includes("output") ? (
				<span
					className={turnTagClassName}
					data-session-turn-tag-kind="output"
					title={
						metrics.outputTokens === undefined
							? "Output token usage not recorded for this turn"
							: `${metrics.outputTokens.toLocaleString()} output tokens`
					}
				>
					{outputTokenLabel}
				</span>
			) : null}
			{visibleTags.includes("cost") ? (
				<span
					className={turnTagClassName}
					data-session-turn-tag-kind="cost"
					title={
						metrics.estimatedCost === undefined
							? "Cost unavailable for this turn"
							: `${turnCostFormatter.format(metrics.estimatedCost)} estimated cost`
					}
				>
					{costLabel}
				</span>
			) : null}
			{visibleTags.includes("errors") ? (
				<span
					className={cn(
						turnTagClassName,
						metrics.errorCount > 0 &&
							"bg-red-50 text-red-700 group-aria-pressed:bg-red-100 dark:bg-red-950/40 dark:text-red-300",
					)}
					data-session-turn-tag-danger={metrics.errorCount > 0 || undefined}
					data-session-turn-tag-kind="errors"
					title={`${metrics.errorCount.toLocaleString()} tool/API ${metrics.errorCount === 1 ? "error" : "errors"}`}
				>
					{errorLabel}
				</span>
			) : null}
			{visibleTags.includes("tools") && toolCallCount > 0 ? (
				<span
					className={cn(turnTagClassName, "gap-1 tabular-nums")}
					data-session-turn-tag-kind="tools"
					title={`${toolCallCount.toLocaleString()} ${toolCallCount === 1 ? "tool call" : "tool calls"}`}
				>
					<TraceWrenchIcon className="size-3" />
					{toolCallCount.toLocaleString()}{" "}
					{toolCallCount === 1 ? "tool call" : "tool calls"}
				</span>
			) : null}
			{visibleTags.includes("files") ? (
				<span
					className={turnTagClassName}
					data-session-turn-tag-kind="files"
					title={
						metrics.editedFiles.length > 0
							? `Files edited:\n${metrics.editedFiles.join("\n")}\n\nDirect agent edits only — changes made by shell commands aren't counted.`
							: "No recognized successful file edits in this turn\n\nDirect agent edits only — changes made by shell commands aren't counted."
					}
				>
					{editedFilesLabel}
				</span>
			) : null}
			{visibleTags.includes("skills") && metrics.skills.length > 0 ? (
				<>
					{metrics.skills
						.slice(0, maxVisibleSkills ?? metrics.skills.length)
						.map((skill) => (
							<span
								key={skill}
								className={cn(turnTagClassName, "max-w-full truncate")}
								data-session-turn-tag-kind="skills"
								title={`Skill used: ${skill}`}
							>
								{skill}
							</span>
						))}
					{maxVisibleSkills !== undefined &&
					metrics.skills.length > maxVisibleSkills ? (
						<span
							className={cn(turnTagClassName, "tabular-nums")}
							data-session-turn-tag-kind="skills"
							title={`Also used:\n${metrics.skills.slice(maxVisibleSkills).join("\n")}`}
						>
							+{metrics.skills.length - maxVisibleSkills}
						</span>
					) : null}
				</>
			) : visibleTags.includes("skills") ? (
				<span
					className={turnTagClassName}
					data-session-turn-tag-kind="skills"
					title="No skill used in this turn"
				>
					No skill
				</span>
			) : null}
		</div>
	);
}
