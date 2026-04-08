import { format, parseISO } from "date-fns";
import { Badge } from "@/app/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";
import type {
	DashboardGroupedDetailPoint,
	DashboardMetricDetailData,
	DashboardSingleDetailPoint,
} from "@/features/dashboard/data/dashboard-static-data";

function formatCompactValue(value: number) {
	if (value >= 1000) {
		return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
	}

	return `${value}`;
}

function formatDayLabel(date: string) {
	return format(parseISO(date), "EEE");
}

function formatNullableValue(value: number | null) {
	return value == null ? "—" : formatCompactValue(value);
}

function GroupedDetailTable({
	points,
	primaryLabel,
	secondaryLabel,
}: {
	points: DashboardGroupedDetailPoint[];
	primaryLabel: string;
	secondaryLabel: string;
}) {
	return (
		<Table className="dashboardy-board-table min-w-[22rem]">
			<TableHeader>
				<TableRow className="border-[color:var(--dashboardy-divider)] hover:bg-transparent">
					<TableHead className="dashboardy-label px-0">Day</TableHead>
					<TableHead className="dashboardy-label px-0 text-right">
						{primaryLabel}
					</TableHead>
					<TableHead className="dashboardy-label px-0 text-right">
						{secondaryLabel}
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{points.map((point) => (
					<TableRow
						key={point.date}
						className="dashboardy-board-row border-[color:var(--dashboardy-divider)] hover:bg-transparent"
					>
						<TableCell className="dashboardy-list-primary px-0">
							{formatDayLabel(point.date)}
						</TableCell>
						<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatNullableValue(point.primary)}
						</TableCell>
						<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-muted)]">
							{formatNullableValue(point.secondary)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function SingleDetailTable({
	points,
	label,
}: {
	points: DashboardSingleDetailPoint[];
	label: string;
}) {
	return (
		<Table className="dashboardy-board-table min-w-[18rem]">
			<TableHeader>
				<TableRow className="border-[color:var(--dashboardy-divider)] hover:bg-transparent">
					<TableHead className="dashboardy-label px-0">Day</TableHead>
					<TableHead className="dashboardy-label px-0 text-right">
						{label}
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{points.map((point) => (
					<TableRow
						key={point.date}
						className="dashboardy-board-row border-[color:var(--dashboardy-divider)] hover:bg-transparent"
					>
						<TableCell className="dashboardy-list-primary px-0">
							{formatDayLabel(point.date)}
						</TableCell>
						<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatNullableValue(point.value)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function DashboardMetricDetailSection({
	detail,
}: {
	detail: DashboardMetricDetailData;
}) {
	const totalPrimary = detail.grouped.points.reduce(
		(sum, point) => sum + (point.primary ?? 0),
		0,
	);
	const totalSecondary = detail.grouped.points.reduce(
		(sum, point) => sum + (point.secondary ?? 0),
		0,
	);
	const totalSingle = detail.single.points.reduce(
		(sum, point) => sum + (point.value ?? 0),
		0,
	);

	return (
		<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
			<section className="dashboardy-bucket-card grid gap-4 rounded-[1.4rem]">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex min-w-0 flex-col gap-1">
						<h3 className="dashboardy-section-title text-base/6">
							Activity mix
						</h3>
						<p className="dashboardy-footnote text-sm/6">
							Daily {detail.grouped.primaryLabel} and{" "}
							{detail.grouped.secondaryLabel}.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge
							variant="secondary"
							className="dashboardy-inline-badge tabular-nums"
						>
							{totalPrimary} {detail.grouped.primaryLabel}
						</Badge>
						<Badge
							variant="outline"
							className="dashboardy-inline-badge tabular-nums"
						>
							{totalSecondary} {detail.grouped.secondaryLabel}
						</Badge>
					</div>
				</div>
				<div className="overflow-x-auto">
					<GroupedDetailTable
						points={detail.grouped.points}
						primaryLabel={detail.grouped.primaryLabel}
						secondaryLabel={detail.grouped.secondaryLabel}
					/>
				</div>
			</section>

			<section className="dashboardy-bucket-card grid gap-4 rounded-[1.4rem]">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex min-w-0 flex-col gap-1">
						<h3 className="dashboardy-section-title text-base/6">
							{detail.single.label}
						</h3>
						<p className="dashboardy-footnote text-sm/6">
							Daily totals for the selected range.
						</p>
					</div>
					<Badge
						variant="secondary"
						className="dashboardy-inline-badge tabular-nums"
					>
						{formatCompactValue(totalSingle)}
					</Badge>
				</div>
				<div className="overflow-x-auto">
					<SingleDetailTable
						points={detail.single.points}
						label={detail.single.label}
					/>
				</div>
			</section>
		</div>
	);
}
