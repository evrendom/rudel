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

function getBoardActualToneClassName(
	tone: DashboardyFlightBoardRow["actualTone"] = "regular",
) {
	return cn("dashboardy-board-actual", {
		"dashboardy-board-actual--green": tone === "green",
		"dashboardy-board-actual--orange": tone === "orange",
		"dashboardy-board-actual--red": tone === "red",
	});
}

function getBoardStatusToneClassName(
	tone: DashboardyFlightBoardRow["statusTone"] = "regular",
) {
	return cn("dashboardy-board-status-copy", {
		"dashboardy-board-status-copy--orange": tone === "orange",
		"dashboardy-board-status-copy--red": tone === "red",
	});
}

function getBoardDotToneClassName(
	tone: DashboardyFlightBoardRow["dotTone"] = "green",
) {
	return cn("dashboardy-board-status-dot", {
		"dashboardy-board-status-dot--orange": tone === "orange",
		"dashboardy-board-status-dot--red": tone === "red",
	});
}

function BoardMeta({
	airlineCode,
	flightNumber,
	detail,
	compact = false,
}: {
	airlineCode: string;
	flightNumber: string;
	detail?: string;
	compact?: boolean;
}) {
	return (
		<div
			className={cn("flex min-w-0 items-center", {
				"gap-2": compact,
				"gap-3": !compact,
				"justify-end": compact,
			})}
		>
			<Avatar
				size="sm"
				className={cn("dashboardy-airline-avatar", {
					"dashboardy-airline-avatar--compact size-3.5 rounded-[0.2rem] after:hidden":
						compact,
				})}
			>
				<AvatarFallback
					className={cn("dashboardy-airline-avatar-fallback", {
						"dashboardy-airline-avatar-fallback--compact": compact,
					})}
				>
					{airlineCode}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex flex-col gap-0.5">
				<p
					className={cn({
						"dashboardy-preview-flight-code": compact,
						"dashboardy-list-primary": !compact,
					})}
				>
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
	if (mode === "preview") {
		return (
			<div className="flex flex-1 flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="dashboardy-preview-heading px-4">{title}</h3>
					<Button
						type="button"
						size="sm"
						variant="link"
						className="dashboardy-preview-action hover:no-underline"
					>
						{actionLabel}
					</Button>
				</div>
				<ul className="flex flex-col">
					{rows.map((row) => (
						<li
							key={`${row.airlineCode}-${row.flightNumber}-${row.city}`}
							className="dashboardy-preview-feed-row"
						>
							<div className="dashboardy-preview-primary">
								<div className="dashboardy-preview-times">
									<time
										className={cn("dashboardy-mono dashboardy-preview-time", {
											"dashboardy-preview-time--struck": row.scheduledStruck,
										})}
									>
										{row.scheduled}
									</time>
									{row.actual ? (
										<time
											className={cn(
												"dashboardy-mono dashboardy-preview-time",
												getBoardActualToneClassName(row.actualTone),
											)}
										>
											{row.actual}
										</time>
									) : null}
								</div>
								<div className="min-w-0 flex flex-col gap-1">
									<p className="dashboardy-preview-city">{row.city}</p>
									<div className="dashboardy-preview-status">
										<span className={getBoardDotToneClassName(row.dotTone)} />
										<p
											className={cn(
												"dashboardy-preview-status-copy",
												getBoardStatusToneClassName(row.statusTone),
											)}
										>
											{row.status}
										</p>
									</div>
								</div>
							</div>
							<div className="dashboardy-preview-meta">
								<Button
									type="button"
									size="xs"
									variant="ghost"
									className="dashboardy-preview-flight-button"
								>
									<BoardMeta
										airlineCode={row.airlineCode}
										flightNumber={row.flightNumber}
										compact
									/>
								</Button>
								{row.detail ? (
									<p className="dashboardy-preview-detail">{row.detail}</p>
								) : null}
							</div>
						</li>
					))}
				</ul>
			</div>
		);
	}

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
					variant="link"
					disabled
					className="dashboardy-link-button h-7 px-0 text-xs"
				>
					{actionLabel}
				</Button>
			</CardHeader>
			<CardContent className="px-0 py-0">
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
										<span
											className={cn("dashboardy-mono dashboardy-preview-time", {
												"dashboardy-preview-time--struck": row.scheduledStruck,
											})}
										>
											{row.scheduled}
										</span>
										{row.actual ? (
											<span
												className={cn(
													"dashboardy-mono",
													getBoardActualToneClassName(row.actualTone),
												)}
											>
												{row.actual}
											</span>
										) : null}
									</div>
								</TableCell>
								<TableCell className="dashboardy-board-route-cell">
									<div className="flex min-w-0 flex-col gap-1">
										<p className="dashboardy-list-primary">{row.city}</p>
										<p className={getBoardStatusToneClassName(row.statusTone)}>
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
			</CardContent>
		</Card>
	);
}
