import { ChevronDownIcon, ChevronUpIcon, UserPlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/ui/avatar";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { TeamInviteLinkSurface } from "@/features/team/components/TeamInviteLinkSurface";
import type {
	TeamPageMemberModelUsage,
	TeamPageMemberOverviewRow,
} from "@/features/team/use-team-page-data";
import {
	formatCompactWholeCurrency,
	formatCompactWholeNumber,
} from "@/lib/format";

const lastActiveDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

const SPARKLINE_WIDTH = 128;
const SPARKLINE_HEIGHT = 28;
const SPARKLINE_PADDING = 2;
const MAX_VISIBLE_MODELS = 3;

type TeamTableSortKey = "activity" | "cost" | "sessions" | "tokens";
type TeamTableSortDirection = "asc" | "desc";

interface TeamTableSortState {
	direction: TeamTableSortDirection;
	key: TeamTableSortKey;
}

function getMemberInitials(displayName: string) {
	const nameParts = displayName
		.trim()
		.split(/\s+/u)
		.filter((part) => part.length > 0);

	if (nameParts.length === 0) {
		return "?";
	}

	const firstInitial = nameParts[0]?.at(0) ?? "";
	const lastInitial =
		nameParts.length > 1 ? (nameParts.at(-1)?.at(0) ?? "") : "";

	return `${firstInitial}${lastInitial}`.toLocaleUpperCase();
}

function formatLastActiveDate(lastActiveDate: string | null) {
	if (!lastActiveDate) {
		return "—";
	}

	const parsedDate = new Date(lastActiveDate);
	if (Number.isNaN(parsedDate.getTime())) {
		return lastActiveDate;
	}

	return lastActiveDateFormatter.format(parsedDate);
}

function buildSparklinePoints(values: readonly number[]) {
	const chartValues =
		values.length === 1 ? [values[0] ?? 0, values[0] ?? 0] : values;
	const maxValue = Math.max(...chartValues, 1);
	const drawableWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING * 2;
	const drawableHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING * 2;

	return chartValues
		.map((value, index) => {
			const x =
				SPARKLINE_PADDING +
				(index / Math.max(chartValues.length - 1, 1)) * drawableWidth;
			const y =
				SPARKLINE_HEIGHT -
				SPARKLINE_PADDING -
				(value / maxValue) * drawableHeight;

			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");
}

function ActivitySparkline({ values }: { values: readonly number[] }) {
	if (values.length === 0) {
		return <p className="text-base text-muted-foreground sm:text-sm">—</p>;
	}

	const totalSessions = values.reduce((total, value) => total + value, 0);

	return (
		<svg
			aria-label={`${totalSessions.toLocaleString()} sessions across ${values.length.toLocaleString()} activity periods`}
			className="h-7 w-32 overflow-visible"
			role="img"
			viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
		>
			<polyline
				className="fill-none stroke-[#4D80E6]"
				points={buildSparklinePoints(values)}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function getActivityTotal(row: TeamPageMemberOverviewRow) {
	return row.activityTrend.reduce((total, value) => total + value, 0);
}

function getNumericSortValue(
	row: TeamPageMemberOverviewRow,
	key: TeamTableSortKey,
) {
	switch (key) {
		case "activity":
			return getActivityTotal(row);
		case "cost":
			return row.cost;
		case "sessions":
			return row.totalSessions;
		case "tokens":
			return row.totalTokens;
	}
}

function sortTeamRows(
	rows: readonly TeamPageMemberOverviewRow[],
	sort: TeamTableSortState | null,
) {
	if (!sort) {
		return rows;
	}

	return [...rows].sort((leftRow, rightRow) => {
		const leftValue = getNumericSortValue(leftRow, sort.key);
		const rightValue = getNumericSortValue(rightRow, sort.key);

		if (leftValue === null) {
			return rightValue === null
				? leftRow.displayName.localeCompare(rightRow.displayName)
				: 1;
		}
		if (rightValue === null) {
			return -1;
		}

		const valueDifference = leftValue - rightValue;
		return (
			(sort.direction === "asc" ? valueDifference : -valueDifference) ||
			leftRow.displayName.localeCompare(rightRow.displayName)
		);
	});
}

function TeamTableSortableHeader({
	align,
	label,
	onSort,
	sort,
	sortKey,
}: {
	align: "left" | "right";
	label: string;
	onSort: (key: TeamTableSortKey) => void;
	sort: TeamTableSortState | null;
	sortKey: TeamTableSortKey;
}) {
	const isActive = sort?.key === sortKey;
	const nextDirection =
		isActive && sort.direction === "desc" ? "ascending" : "descending";

	return (
		<button
			type="button"
			aria-label={`Sort by ${label}, ${nextDirection}`}
			className={`relative flex h-full w-full min-w-0 items-center gap-1 px-3 text-base font-medium whitespace-nowrap text-muted-foreground outline-none hover:bg-muted/50 focus-visible:z-10 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring sm:text-sm ${
				align === "right" ? "justify-end text-right" : "justify-start text-left"
			}`}
			onClick={() => onSort(sortKey)}
		>
			<span className="min-w-0 truncate">{label}</span>
			{isActive ? (
				sort.direction === "asc" ? (
					<ChevronUpIcon
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-muted-foreground"
					/>
				) : (
					<ChevronDownIcon
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-muted-foreground"
					/>
				)
			) : null}
			<span
				aria-hidden="true"
				className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
			/>
		</button>
	);
}

function ModelComposition({
	usage,
}: {
	usage: readonly TeamPageMemberModelUsage[];
}) {
	const sortedUsage = [...usage].sort(
		(leftModel, rightModel) =>
			rightModel.usageCount - leftModel.usageCount ||
			leftModel.model.localeCompare(rightModel.model),
	);
	const visibleModels = sortedUsage
		.slice(0, MAX_VISIBLE_MODELS)
		.map((modelUsage) => modelUsage.model);
	const hiddenModelCount = Math.max(
		sortedUsage.length - visibleModels.length,
		0,
	);
	const modelNames = sortedUsage
		.map((modelUsage) => formatModelDisplayLabel(modelUsage.model))
		.join(", ");

	return (
		<div
			className="flex min-w-0 items-center gap-1.5 overflow-hidden"
			title={modelNames || "No model activity"}
		>
			<DashboardModelBadges models={visibleModels} size="table" />
			{hiddenModelCount > 0 ? (
				<p className="shrink-0 text-base font-medium text-muted-foreground tabular-nums sm:text-sm">
					+{hiddenModelCount}
				</p>
			) : null}
		</div>
	);
}

function TeamInviteRow({ organizationId }: { organizationId: string }) {
	return (
		<tr className="h-16 border-b border-black/5 dark:border-white/5">
			<td className="h-16 py-0 pr-3 pl-0 align-middle">
				<div className="flex min-w-0 items-center gap-3">
					<div className="grid size-10 shrink-0 place-content-center rounded-full border border-dashed border-black/15 bg-background dark:border-white/15">
						<UserPlusIcon
							aria-hidden="true"
							className="size-4 shrink-0 stroke-muted-foreground"
						/>
					</div>
					<div className="min-w-0">
						<p className="truncate text-base font-medium text-foreground sm:text-sm">
							Add teammate
						</p>
						<p className="truncate text-base text-muted-foreground sm:text-sm">
							Invite with a link
						</p>
					</div>
				</div>
			</td>
			<td className="h-16 py-0 pr-0 pl-3 align-middle" colSpan={6}>
				<TeamInviteLinkSurface layout="row" organizationId={organizationId} />
			</td>
		</tr>
	);
}

function TeamMemberRow({ row }: { row: TeamPageMemberOverviewRow }) {
	return (
		<tr className="h-16 border-b border-black/5 dark:border-white/5">
			<td className="h-16 py-0 pr-3 pl-0 align-middle">
				<div className="flex min-w-0 items-center gap-3">
					<Avatar className="size-10 overflow-hidden bg-background outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
						{row.imageUrl ? <AvatarImage alt="" src={row.imageUrl} /> : null}
						<AvatarFallback className="bg-muted font-medium text-foreground">
							{getMemberInitials(row.displayName)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<p className="truncate text-base font-medium text-foreground sm:text-sm">
							{row.displayName}
						</p>
						<p className="truncate text-base text-muted-foreground sm:text-sm">
							{row.role}
						</p>
					</div>
				</div>
			</td>
			<td className="h-16 px-3 py-0 align-middle">
				<ModelComposition usage={row.modelUsage} />
			</td>
			<td className="h-16 px-3 py-0 align-middle">
				<ActivitySparkline values={row.activityTrend} />
			</td>
			<td className="h-16 px-3 py-0 text-right align-middle">
				<p className="text-base font-medium text-foreground tabular-nums sm:text-sm">
					{formatCompactWholeNumber(row.totalSessions)}
				</p>
			</td>
			<td className="h-16 px-3 py-0 text-right align-middle">
				<p className="text-base font-medium text-foreground tabular-nums sm:text-sm">
					{formatCompactWholeNumber(row.totalTokens)}
				</p>
			</td>
			<td className="h-16 px-3 py-0 text-right align-middle">
				<p className="text-base font-medium text-foreground tabular-nums sm:text-sm">
					{formatCompactWholeCurrency(row.cost)}
				</p>
			</td>
			<td className="h-16 py-0 pr-0 pl-3 text-right align-middle">
				<p className="text-base text-muted-foreground tabular-nums sm:text-sm">
					{formatLastActiveDate(row.lastActiveDate)}
				</p>
			</td>
		</tr>
	);
}

export function TeamMemberOverviewTable({
	canInviteTeamMembers,
	organizationId,
	rows,
}: {
	canInviteTeamMembers: boolean;
	organizationId: string | null;
	rows: readonly TeamPageMemberOverviewRow[];
}) {
	const [sort, setSort] = useState<TeamTableSortState | null>(null);
	const sortedRows = useMemo(() => sortTeamRows(rows, sort), [rows, sort]);

	function handleSort(key: TeamTableSortKey) {
		setSort((currentSort) => ({
			key,
			direction:
				currentSort?.key === key && currentSort.direction === "desc"
					? "asc"
					: "desc",
		}));
	}

	return (
		<div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap lg:-mx-6">
			<div className="inline-block min-w-full px-16 py-2 align-middle">
				<table className="w-full min-w-272 border-collapse">
					<colgroup>
						<col className="w-[24%]" />
						<col className="w-[21%]" />
						<col className="w-[16%]" />
						<col className="w-[9%]" />
						<col className="w-[10%]" />
						<col className="w-[9%]" />
						<col className="w-[11%]" />
					</colgroup>
					<thead>
						<tr className="h-10 border-b border-black/10 dark:border-white/10">
							<th className="h-10 py-0 pr-3 pl-0 text-left text-sm font-medium whitespace-nowrap text-muted-foreground">
								Teammate
							</th>
							<th className="h-10 px-3 py-0 text-left text-sm font-medium whitespace-nowrap text-muted-foreground">
								Model composition
							</th>
							<th
								aria-sort={
									sort?.key === "activity"
										? sort.direction === "asc"
											? "ascending"
											: "descending"
										: "none"
								}
								className="h-10 p-0 text-left whitespace-nowrap"
							>
								<TeamTableSortableHeader
									align="left"
									label="Activity"
									onSort={handleSort}
									sort={sort}
									sortKey="activity"
								/>
							</th>
							<th
								aria-sort={
									sort?.key === "sessions"
										? sort.direction === "asc"
											? "ascending"
											: "descending"
										: "none"
								}
								className="h-10 p-0 text-right whitespace-nowrap"
							>
								<TeamTableSortableHeader
									align="right"
									label="Sessions"
									onSort={handleSort}
									sort={sort}
									sortKey="sessions"
								/>
							</th>
							<th
								aria-sort={
									sort?.key === "tokens"
										? sort.direction === "asc"
											? "ascending"
											: "descending"
										: "none"
								}
								className="h-10 p-0 text-right whitespace-nowrap"
							>
								<TeamTableSortableHeader
									align="right"
									label="Tokens used"
									onSort={handleSort}
									sort={sort}
									sortKey="tokens"
								/>
							</th>
							<th
								aria-sort={
									sort?.key === "cost"
										? sort.direction === "asc"
											? "ascending"
											: "descending"
										: "none"
								}
								className="h-10 p-0 text-right whitespace-nowrap"
							>
								<TeamTableSortableHeader
									align="right"
									label="API cost"
									onSort={handleSort}
									sort={sort}
									sortKey="cost"
								/>
							</th>
							<th className="h-10 py-0 pr-0 pl-3 text-right text-sm font-medium whitespace-nowrap text-muted-foreground">
								Last active
							</th>
						</tr>
					</thead>
					<tbody>
						{canInviteTeamMembers && organizationId ? (
							<TeamInviteRow organizationId={organizationId} />
						) : null}
						{sortedRows.map((row) => (
							<TeamMemberRow key={row.userId} row={row} />
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
