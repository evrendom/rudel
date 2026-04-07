import { ArrowUpRightIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/app/ui/avatar";
import { Button } from "@/app/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";
import type { DashboardyFlightBoardRow } from "@/features/dashboardy/data/dashboardy-static-data";
import { cn } from "@/lib/utils";

function getStatusToneClassName(status: string) {
	return status === "Canceled"
		? "dashboardy-board-status-copy dashboardy-board-status-copy--canceled"
		: "dashboardy-board-status-copy dashboardy-board-status-copy--late";
}

function BoardMeta({
	airlineCode,
	flightNumber,
	detail,
}: {
	airlineCode: string;
	flightNumber: string;
	detail?: string;
}) {
	return (
		<div className="flex min-w-0 items-center gap-3">
			<Avatar size="sm" className="dashboardy-airline-avatar">
				<AvatarFallback className="dashboardy-airline-avatar-fallback">
					{airlineCode}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex flex-col gap-0.5">
				<p className="dashboardy-list-primary">
					{airlineCode} {flightNumber}
				</p>
				{detail ? <p className="dashboardy-list-secondary">{detail}</p> : null}
			</div>
		</div>
	);
}

export function DashboardyFlightBoard({
	title,
	actionLabel,
	rows,
	mode = "table",
}: {
	title: string;
	actionLabel: string;
	rows: DashboardyFlightBoardRow[];
	mode?: "table" | "preview";
}) {
	return (
		<Card
			size="sm"
			className="dashboardy-card overflow-hidden rounded-[1.9rem] py-0 shadow-none"
		>
			<CardHeader className="flex flex-row items-center justify-between border-b border-[color:var(--dashboardy-border)] px-5 py-4">
				<CardTitle className="dashboardy-section-title text-[15px]">
					{title}
				</CardTitle>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled
					className="dashboardy-link-button h-7 px-0 text-xs"
				>
					{actionLabel}
					<ArrowUpRightIcon data-icon="inline-end" />
				</Button>
			</CardHeader>
			<CardContent className="px-0 py-0">
				{mode === "preview" ? (
					<ul className="flex flex-col">
						{rows.slice(0, 3).map((row) => (
							<li
								key={`${row.airlineCode}-${row.flightNumber}-${row.city}`}
								className="dashboardy-preview-row"
							>
								<div className="dashboardy-preview-times">
									<span className="dashboardy-mono">{row.scheduled}</span>
									<span className="dashboardy-preview-actual">
										{row.actual ?? "--"}
									</span>
								</div>
								<div className="min-w-0 flex-1">
									<p className="dashboardy-list-primary truncate">{row.city}</p>
									<p className={getStatusToneClassName(row.status)}>
										{row.status}
									</p>
								</div>
								<div className="hidden min-w-0 md:block">
									<BoardMeta
										airlineCode={row.airlineCode}
										flightNumber={row.flightNumber}
										detail={row.detail}
									/>
								</div>
							</li>
						))}
					</ul>
				) : (
					<Table className="dashboardy-board-table min-w-[38rem]">
						<TableHeader className="sr-only">
							<TableRow>
								<TableHead>Time</TableHead>
								<TableHead>Route</TableHead>
								<TableHead>Flight</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow
									key={`${row.airlineCode}-${row.flightNumber}-${row.city}`}
									className="dashboardy-board-row"
								>
									<TableCell className="dashboardy-board-time-cell">
										<div className="dashboardy-board-times">
											<span className="dashboardy-mono">{row.scheduled}</span>
											<span className="dashboardy-board-actual">
												{row.actual ?? "--"}
											</span>
										</div>
									</TableCell>
									<TableCell className="dashboardy-board-route-cell">
										<div className="flex min-w-0 flex-col gap-1">
											<p className="dashboardy-list-primary">{row.city}</p>
											<p className={cn(getStatusToneClassName(row.status))}>
												{row.status}
											</p>
										</div>
									</TableCell>
									<TableCell className="dashboardy-board-meta-cell">
										<BoardMeta
											airlineCode={row.airlineCode}
											flightNumber={row.flightNumber}
											detail={row.detail}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
