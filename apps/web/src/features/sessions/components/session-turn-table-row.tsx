import { scanMemberLanguageSignals } from "@rudel/language-signals";
import {
	type CSSProperties,
	type KeyboardEvent,
	memo,
	type ReactNode,
} from "react";
import {
	ModelTraceIcon,
	TraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { CONVERSATION_TOOL_ICONS } from "@/components/conversation/conversation-trace-tool-icons";
import { SignalText } from "@/components/signal-text";
import { cn } from "@/lib/utils";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { TurnTableColumn } from "./session-turn-table-columns";
import {
	SessionTurnCompactionRow,
	SessionTurnEpisodeRow,
} from "./session-turn-table-rows";
import { recordAnchorJournal } from "./transcript-forensics";

function SessionTurnRelativeMagnitude({
	columnLabel,
	value,
}: {
	columnLabel: string;
	value: number;
}) {
	const magnitude = Math.min(100, Math.max(0, value));
	const roundedMagnitude = Math.round(magnitude);
	const valueText = `${roundedMagnitude}% of the largest ${columnLabel.toLowerCase()} value in this ledger`;

	return (
		<div
			aria-label={`${columnLabel} relative magnitude`}
			aria-valuemax={100}
			aria-valuemin={0}
			aria-valuenow={roundedMagnitude}
			aria-valuetext={valueText}
			className="relative flex size-4 shrink-0 items-center justify-center"
			role="progressbar"
			title={valueText}
		>
			<svg
				aria-hidden="true"
				className="size-4 shrink-0 overflow-visible fill-none"
				viewBox="0 0 16 16"
			>
				<circle
					className="stroke-(--session-overview-border)"
					cx="8"
					cy="8"
					r="6.25"
					strokeWidth="2.5"
				/>
				{magnitude > 0 ? (
					<circle
						className="stroke-(--session-overview-accent)"
						cx="8"
						cy="8"
						pathLength="100"
						r="6.25"
						strokeDasharray={`${magnitude} ${100 - magnitude}`}
						strokeLinecap="round"
						strokeWidth="2.5"
						transform="rotate(-90 8 8)"
					/>
				) : null}
			</svg>
		</div>
	);
}

function SessionTurnModelIconStack({
	model,
	subagentCount,
}: {
	model: string | undefined;
	subagentCount: number;
}) {
	const offsetRem = subagentCount > 0 ? 0.5 / subagentCount : 0;
	const stackWidthRem = 1.25 + offsetRem * subagentCount;
	const subagentIcons: ReactNode[] = [];
	for (
		let subagentNumber = 1;
		subagentNumber <= subagentCount;
		subagentNumber++
	) {
		subagentIcons.push(
			<span
				key={`subagent-${subagentNumber}`}
				className="session-turn-table-model-icon-shell absolute top-0 left-(--session-subagent-icon-offset) z-(--session-subagent-icon-layer) flex size-5 shrink-0"
				data-subagent-model-icon
				style={
					{
						"--session-subagent-icon-layer": subagentCount - subagentNumber + 1,
						"--session-subagent-icon-offset": `${offsetRem * subagentNumber}rem`,
					} as CSSProperties
				}
				title={`Subagent ${subagentNumber}`}
			>
				<ModelTraceIcon
					className="session-turn-table-model-icon"
					expandable={false}
					expanded={false}
					model={model}
				/>
			</span>,
		);
	}
	return (
		<span
			aria-hidden="true"
			className="relative flex h-5 w-(--session-subagent-stack-width) shrink-0"
			data-subagent-icon-count={subagentCount}
			style={
				{
					"--session-subagent-stack-width": `${stackWidthRem}rem`,
				} as CSSProperties
			}
			title={
				subagentCount === 0
					? (model ?? "Model")
					: `${model ?? "Model"} with ${subagentCount.toLocaleString()} ${subagentCount === 1 ? "subagent" : "subagents"}`
			}
		>
			<span
				className="session-turn-table-model-icon-shell absolute top-0 left-0 z-(--session-model-icon-layer) flex size-5 shrink-0"
				style={
					{
						"--session-model-icon-layer": subagentCount + 1,
					} as CSSProperties
				}
			>
				<ModelTraceIcon
					className="session-turn-table-model-icon"
					expandable={false}
					expanded={false}
					model={model}
				/>
			</span>
			{subagentIcons}
		</span>
	);
}

export const SessionTurnTableRowView = memo(function SessionTurnTableRowView({
	beginsTurn,
	collapsedEpisodeKeys,
	columns,
	emphasized,
	episode,
	gridTemplate,
	inViewport,
	matchesLens,
	model,
	onEpisodeToggle,
	onKeyDown,
	onPrefetchTurn,
	onSelect,
	row,
	selected,
	showSpeakerColumn,
	userImageUrl,
	userLabel,
	viewed,
	visibleIndex,
}: {
	beginsTurn: boolean;
	collapsedEpisodeKeys: ReadonlySet<string> | undefined;
	columns: readonly TurnTableColumn[];
	emphasized: boolean;
	episode: SessionTurnEpisode | undefined;
	gridTemplate: string;
	inViewport: boolean;
	matchesLens: boolean;
	model: string | undefined;
	onEpisodeToggle: ((key: string) => void) | undefined;
	onKeyDown: (
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) => void;
	onPrefetchTurn?: (turnId: string, immediate: boolean) => void;
	onSelect: (selection: {
		index: number;
		speaker: SessionTurnTableRow["speaker"];
	}) => void;
	row: SessionTurnTableRow;
	selected: boolean;
	showSpeakerColumn: boolean;
	userImageUrl: string | undefined;
	userLabel: string;
	viewed: boolean;
	visibleIndex: number;
}) {
	const { match } = row;
	const highlighted = emphasized || viewed;
	return (
		<>
			{episode ? (
				<SessionTurnEpisodeRow
					collapsed={collapsedEpisodeKeys?.has(episode.key) ?? false}
					episode={episode}
					onToggle={
						onEpisodeToggle ? () => onEpisodeToggle(episode.key) : undefined
					}
				/>
			) : null}
			{beginsTurn
				? match.option.compactionsBefore.map((compaction) => (
						<SessionTurnCompactionRow
							key={compaction.key}
							compaction={compaction}
						/>
					))
				: null}
			<tr
				aria-current={selected ? "true" : undefined}
				className={cn(
					"group relative isolate grid h-9 min-w-full cursor-pointer select-none outline-none [grid-template-columns:var(--session-turn-grid-template)] hover:bg-(--session-overview-hover) hover:[&>td]:bg-(--session-overview-hover) focus-visible:z-10 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)",
					matchesLens &&
						"[box-shadow:inset_2px_0_0_var(--session-overview-accent)]",
				)}
				data-visible-index={visibleIndex}
				data-turn-index={match.index}
				data-speaker={row.speaker}
				data-in-viewport={inViewport ? "true" : undefined}
				data-highlighted={highlighted ? "true" : undefined}
				data-speaker-emphasized={emphasized ? "true" : undefined}
				data-selected={selected ? "true" : undefined}
				data-viewed={viewed ? "true" : undefined}
				style={
					{
						"--session-turn-grid-template": gridTemplate,
					} as CSSProperties
				}
				tabIndex={0}
				onKeyDown={(event) => onKeyDown(event, visibleIndex)}
				onPointerDown={(event) => {
					onPrefetchTurn?.(match.option.key, true);
					if (event.isPrimary && event.button === 0) {
						recordAnchorJournal({
							speaker: row.speaker,
							turnId: match.option.key,
							turnIndex: match.index,
							type: "select",
						});
						onSelect({ index: match.index, speaker: row.speaker });
					}
				}}
				onPointerEnter={() => onPrefetchTurn?.(match.option.key, false)}
			>
				<td
					aria-label={
						viewed ? "Visible in transcript" : "Outside transcript viewport"
					}
					className="flex h-full items-center justify-center p-0"
				>
					<div
						aria-hidden="true"
						className="size-full bg-transparent"
						data-viewed-indicator
					/>
				</td>
				{showSpeakerColumn ? (
					<td
						aria-label={
							row.speaker === "member"
								? userLabel
								: `${model ?? "Model"}${
										row.subagentCount > 0
											? ` with ${row.subagentCount.toLocaleString()} ${row.subagentCount === 1 ? "subagent" : "subagents"}`
											: ""
									}`
						}
						className="flex h-full min-w-0 items-center overflow-hidden py-1.5 pl-1"
					>
						<div className="session-constellation-tree min-w-0">
							<div
								className="flex min-w-0 items-center"
								data-trace-tree-row-content
							>
								{row.speaker === "member" ? (
									<span
										className="relative z-20 flex size-5 shrink-0"
										title={userLabel}
									>
										<UserTraceAvatar
											expanded={false}
											expandable={false}
											imageUrl={userImageUrl}
										/>
									</span>
								) : null}
								{row.speaker === "model" ? (
									<div className="flex shrink-0 items-center">
										<SessionTurnModelIconStack
											model={model}
											subagentCount={row.subagentCount}
										/>
										{row.toolCallGroups.map((group, groupIndex) => {
											const toolNames = Array.from(new Set(group.names)).join(
												", ",
											);
											const countLabel = `${group.count.toLocaleString()} ${group.count === 1 ? "tool call" : "tool calls"}`;
											return (
												<span
													key={group.icon}
													aria-label={`${countLabel}: ${toolNames}`}
													className="relative -ml-3 shrink-0"
													role="img"
													style={{
														zIndex: row.toolCallGroups.length - groupIndex,
													}}
													title={`${countLabel}: ${toolNames}`}
												>
													<TraceIcon
														icon={CONVERSATION_TOOL_ICONS[group.icon]}
														toolIcon={group.icon}
														tone={group.tone}
													/>
													{group.count > 1 ? (
														<span
															aria-hidden="true"
															className="absolute right-0 bottom-0 z-10 min-w-2.5 rounded-[2px] bg-(--session-overview-surface) px-px text-center text-[0.5rem] leading-[0.625rem] font-semibold text-(--session-overview-text) tabular-nums shadow-[0_0_0_1px_var(--session-overview-surface)]"
														>
															{group.count}x
														</span>
													) : null}
												</span>
											);
										})}
									</div>
								) : null}
							</div>
						</div>
					</td>
				) : null}
				{columns.map((column) => {
					const values = column.getValues(row);
					return (
						<td
							key={column.key}
							aria-label={column.label}
							className={cn(
								"flex h-full min-w-0 items-center overflow-hidden py-1.5",
								column.key === "time" ? "pr-1.5 pl-0" : "px-1.5",
							)}
						>
							<div className="min-w-0 w-full overflow-hidden">
								{values.length > 0 ? (
									<div
										className={cn(
											"flex min-w-0 flex-1 items-center overflow-hidden",
											column.appearance === "tag"
												? "flex-nowrap gap-1"
												: "gap-1.5",
										)}
									>
										{values.map((value) => (
											<div
												key={
													value.key ??
													`${value.title ?? "value"}:${value.label}`
												}
												className={cn(
													"min-w-0 max-w-full text-(--session-overview-muted)",
													value.relativeMagnitude === undefined && "truncate",
													column.appearance === "tag"
														? "rounded-full bg-(--session-overview-surface) px-1.5 py-0.5 text-xs font-medium tracking-[-0.01em]"
														: "text-xs",
													column.appearance !== "text" && "tabular-nums",
													column.appearance === "text" &&
														"[&_[data-signal]]:rounded-md [&_[data-signal]]:px-0.75 [&_[data-signal]]:py-px [&_[data-signal]]:[font:inherit]",
												)}
												title={value.title}
											>
												{column.appearance === "text" ? (
													<SignalText
														scanSignals={
															row.speaker === "member"
																? scanMemberLanguageSignals
																: undefined
														}
														text={value.label}
													/>
												) : value.relativeMagnitude === undefined ? (
													value.label
												) : (
													<div className="flex min-w-0 items-center gap-1.5">
														<SessionTurnRelativeMagnitude
															columnLabel={column.label}
															value={value.relativeMagnitude}
														/>
														<span className="min-w-0 truncate">
															{value.label}
														</span>
													</div>
												)}
											</div>
										))}
									</div>
								) : (
									<p className="text-xs text-(--session-overview-subtle)">—</p>
								)}
							</div>
						</td>
					);
				})}
			</tr>
		</>
	);
});
