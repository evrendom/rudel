import { Collapsible } from "@base-ui/react/collapsible";
import { Fragment, memo, useId, useState } from "react";
import {
	ModelTraceIcon,
	TraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { getSessionAdalineTurnStatus } from "./session-adaline-model";
import type { SelectedTurnOption } from "./session-selected-turn";
import {
	formatSessionTurnWaterfallMetricValue,
	type SessionTurnWaterfallMetric,
	type SessionTurnWaterfallRow,
} from "./session-turn-waterfall";
import type {
	SessionTurnWaterfallTraceBranch,
	SessionTurnWaterfallTraceRow,
} from "./session-turn-waterfall-trace";
import { WaterfallTreeRow } from "./session-turn-waterfall-tree-row";
import {
	getTraceBarPosition,
	getTraceIcon,
	type WaterfallBarPosition,
} from "./session-turn-waterfall-tree-utils";

function getBranchLabel(row: SessionTurnWaterfallTraceRow, modelLabel: string) {
	switch (row.kind) {
		case "activity":
			return `${modelLabel} activity`;
		case "message":
			return modelLabel;
		case "reasoning":
			return `${modelLabel} reasoning`;
		default:
			return row.label;
	}
}

function getCollapsedTraceIcons(
	branches: readonly SessionTurnWaterfallTraceBranch[],
) {
	const seenKinds = new Set<SessionTurnWaterfallTraceRow["kind"]>();
	const icons: { Icon: ReturnType<typeof getTraceIcon>; key: string }[] = [];

	for (const branch of branches) {
		for (const row of [branch.row, ...branch.children]) {
			if (seenKinds.has(row.kind)) {
				continue;
			}
			seenKinds.add(row.kind);
			icons.push({ Icon: getTraceIcon(row.kind), key: row.kind });
			if (icons.length === 4) {
				return icons;
			}
		}
	}

	return icons;
}

function WaterfallTraceBranch({
	branch,
	hasNext,
	metric,
	modelLabel,
	onSelect,
	option,
	turnIndex,
	turnPosition,
}: {
	branch: SessionTurnWaterfallTraceBranch;
	hasNext: boolean;
	metric: SessionTurnWaterfallMetric;
	modelLabel: string;
	onSelect: (index: number) => void;
	option: SelectedTurnOption;
	turnIndex: number;
	turnPosition: WaterfallBarPosition;
}) {
	const contentId = useId();
	const [open, setOpen] = useState(true);
	const position = getTraceBarPosition(option, turnPosition, branch.row);
	const durationLabel = formatSessionTurnWaterfallMetricValue(
		branch.row.durationMs === undefined
			? undefined
			: branch.row.durationMs / 1_000,
		"time",
	);
	const hasChildren = branch.children.length > 0;

	return (
		<li>
			<Collapsible.Root open={open} onOpenChange={setOpen}>
				<WaterfallTreeRow
					active={false}
					collapse={hasChildren ? { open } : undefined}
					continues={(hasChildren && open) || hasNext}
					depth={2}
					error={branch.row.status === "error"}
					icon={getTraceIcon(branch.row.kind)}
					label={getBranchLabel(branch.row, modelLabel)}
					onSelect={() => onSelect(turnIndex)}
					position={metric === "time" ? position : undefined}
					preview={branch.row.preview}
					status={branch.row.status}
					valueLabel={durationLabel}
				/>
				{hasChildren ? (
					<Collapsible.Panel id={contentId} className="transition-none">
						<ol className="list-none">
							{branch.children.map((child, childIndex) => (
								<li key={child.id}>
									<WaterfallTreeRow
										active={false}
										continues={childIndex < branch.children.length - 1}
										depth={3}
										error={child.status === "error"}
										icon={getTraceIcon(child.kind)}
										label={child.label}
										onSelect={() => onSelect(turnIndex)}
										position={
											metric === "time"
												? getTraceBarPosition(option, turnPosition, child)
												: undefined
										}
										preview={child.preview}
										status={child.status}
										valueLabel={formatSessionTurnWaterfallMetricValue(
											child.durationMs === undefined
												? undefined
												: child.durationMs / 1_000,
											"time",
										)}
									/>
								</li>
							))}
						</ol>
					</Collapsible.Panel>
				) : null}
			</Collapsible.Root>
		</li>
	);
}

function WaterfallModelTrace({
	branches,
	hasNext,
	metric,
	model,
	modelLabel,
	onSelect,
	option,
	turnIndex,
	turnPosition,
	valueLabel,
}: {
	branches: readonly SessionTurnWaterfallTraceBranch[];
	hasNext: boolean;
	metric: SessionTurnWaterfallMetric;
	model: string | undefined;
	modelLabel: string;
	onSelect: (index: number) => void;
	option: SelectedTurnOption;
	turnIndex: number;
	turnPosition: SessionTurnWaterfallRow;
	valueLabel: string;
}) {
	const contentId = useId();
	const [open, setOpen] = useState(true);
	const hasChildren = branches.length > 0;
	const turnStatus = getSessionAdalineTurnStatus(option);
	const collapsedTraceIcons = open ? [] : getCollapsedTraceIcons(branches);

	return (
		<li className="[contain-intrinsic-size:auto_80px] [content-visibility:auto]">
			<Collapsible.Root open={open} onOpenChange={setOpen}>
				<WaterfallTreeRow
					active={false}
					collapse={hasChildren ? { open } : undefined}
					continues={(hasChildren && open) || hasNext}
					depth={1}
					error={turnStatus === "error"}
					iconNode={
						<span className="flex shrink-0 items-center">
							<span className="relative z-10">
								<ModelTraceIcon
									expandable={false}
									expanded={false}
									model={model}
								/>
							</span>
							{collapsedTraceIcons.map(({ Icon, key }, index) => (
								<span
									key={key}
									className="relative -ml-1.5"
									style={{ zIndex: collapsedTraceIcons.length - index }}
								>
									<TraceIcon
										className="border-(--session-overview-border) bg-(--session-overview-surface) text-(--session-overview-muted) shadow-[0_0_0_1px_var(--session-overview-surface)]"
										icon={Icon}
									/>
								</span>
							))}
						</span>
					}
					label={modelLabel}
					onSelect={() => onSelect(turnIndex)}
					position={turnPosition}
					preview={option.preview}
					status={turnStatus}
					valueLabel={valueLabel}
				/>
				{hasChildren ? (
					<Collapsible.Panel id={contentId} className="transition-none">
						<ol className="list-none">
							{branches.map((branch, branchIndex) => (
								<WaterfallTraceBranch
									key={branch.row.id}
									branch={branch}
									hasNext={branchIndex < branches.length - 1}
									metric={metric}
									modelLabel={modelLabel}
									onSelect={onSelect}
									option={option}
									turnIndex={turnIndex}
									turnPosition={turnPosition}
								/>
							))}
						</ol>
					</Collapsible.Panel>
				) : null}
			</Collapsible.Root>
		</li>
	);
}

export const SessionTurnWaterfallTreeTurn = memo(
	function SessionTurnWaterfallTreeTurn({
		branches,
		hasNext,
		metric,
		model,
		modelLabel,
		onSelect,
		option,
		selected,
		turnPosition,
		userImageUrl,
		userLabel,
		valueLabel,
	}: {
		branches: readonly SessionTurnWaterfallTraceBranch[];
		hasNext: boolean;
		metric: SessionTurnWaterfallMetric;
		model: string | undefined;
		modelLabel: string;
		onSelect: (index: number) => void;
		option: SelectedTurnOption;
		selected: boolean;
		turnPosition: SessionTurnWaterfallRow;
		userImageUrl: string | undefined;
		userLabel: string;
		valueLabel: string;
	}) {
		return (
			<Fragment>
				<li className="[contain-intrinsic-size:auto_40px] [content-visibility:auto]">
					<WaterfallTreeRow
						active={selected}
						continues
						dataTurnIndex={turnPosition.index}
						depth={1}
						error={false}
						iconNode={
							<UserTraceAvatar
								expandable={false}
								expanded={false}
								imageUrl={userImageUrl}
							/>
						}
						label={userLabel}
						onSelect={() => onSelect(turnPosition.index)}
						preview={option.memberPreview}
						status="success"
					/>
				</li>
				<WaterfallModelTrace
					branches={branches}
					hasNext={hasNext}
					metric={metric}
					model={model}
					modelLabel={modelLabel}
					onSelect={onSelect}
					option={option}
					turnIndex={turnPosition.index}
					turnPosition={turnPosition}
					valueLabel={valueLabel}
				/>
			</Fragment>
		);
	},
);
