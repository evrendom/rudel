import { format, parseISO } from "date-fns";
import { Badge } from "@/app/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
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
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Day</TableHead>
					<TableHead className="text-right">{primaryLabel}</TableHead>
					<TableHead className="text-right">{secondaryLabel}</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{points.map((point) => (
					<TableRow key={point.date}>
						<TableCell className="font-medium text-foreground">
							{formatDayLabel(point.date)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNullableValue(point.primary)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
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
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Day</TableHead>
					<TableHead className="text-right">{label}</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{points.map((point) => (
					<TableRow key={point.date}>
						<TableCell className="font-medium text-foreground">
							{formatDayLabel(point.date)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
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
			<Card size="sm" className="h-full bg-card/90 shadow-none ring-1 ring-border/60">
				<CardHeader className="gap-3">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-1">
							<CardTitle>Activity mix</CardTitle>
							<CardDescription>
								Daily {detail.grouped.primaryLabel} and {detail.grouped.secondaryLabel}.
							</CardDescription>
						</div>
						<div className="flex flex-wrap gap-2">
							<Badge variant="secondary" className="tabular-nums">
								{totalPrimary} {detail.grouped.primaryLabel}
							</Badge>
							<Badge variant="outline" className="tabular-nums">
								{totalSecondary} {detail.grouped.secondaryLabel}
							</Badge>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<GroupedDetailTable
						points={detail.grouped.points}
						primaryLabel={detail.grouped.primaryLabel}
						secondaryLabel={detail.grouped.secondaryLabel}
					/>
				</CardContent>
			</Card>

			<Card size="sm" className="h-full bg-card/90 shadow-none ring-1 ring-border/60">
				<CardHeader className="gap-3">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-1">
							<CardTitle>{detail.single.label}</CardTitle>
							<CardDescription>Daily totals for the selected range.</CardDescription>
						</div>
						<Badge variant="secondary" className="tabular-nums">
							{formatCompactValue(totalSingle)}
						</Badge>
					</div>
				</CardHeader>
				<CardContent>
					<SingleDetailTable
						points={detail.single.points}
						label={detail.single.label}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
