"use client";

import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/app/ui/button";
import { Calendar } from "@/app/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { getSupportedAnalyticsDateRange } from "@/lib/analytics-date-range";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function isValidDate(date: Date) {
	return Number.isFinite(date.getTime());
}

export function DashboardDateControls({ className }: { className?: string }) {
	const { state, actions } = useDateRange();
	const [open, setOpen] = useState(false);

	const selectedDateRange = useMemo<DateRange | undefined>(() => {
		const fromDate = parseISO(state.startDate);
		const toDate = parseISO(state.endDate);

		if (!isValidDate(fromDate) || !isValidDate(toDate)) {
			return undefined;
		}

		return {
			from: fromDate,
			to: toDate,
		};
	}, [state.endDate, state.startDate]);
	const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>(
		selectedDateRange,
	);
	const supportedDateRange = useMemo(
		() => getSupportedAnalyticsDateRange(selectedDateRange?.to ?? new Date()),
		[selectedDateRange?.to],
	);

	const canApplyRange = Boolean(draftDateRange?.from && draftDateRange.to);

	const displayValue =
		selectedDateRange?.from && selectedDateRange.to
			? `${format(selectedDateRange.from, "LLL dd, y")} - ${format(selectedDateRange.to, "LLL dd, y")}`
			: selectedDateRange?.from
				? format(selectedDateRange.from, "LLL dd, y")
				: "Pick a date";

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);

				if (nextOpen) {
					setDraftDateRange(selectedDateRange);
				}
			}}
		>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						id="dashboard-date-range"
						className={cn(
							"dashboardy-action-button h-8 justify-start gap-1.5 rounded-full border-[color:var(--dashboardy-border)] bg-transparent px-3 text-xs font-medium text-[color:var(--dashboardy-heading)] shadow-none sm:h-8 sm:text-[13px]",
							className,
						)}
					/>
				}
			>
				<CalendarIcon data-icon="inline-start" className="size-3.5" />
				{displayValue ? displayValue : <span>Pick a date</span>}
			</PopoverTrigger>
			<PopoverContent
				className="w-auto gap-0 overflow-hidden p-0"
				align="end"
			>
				<Calendar
					mode="range"
					defaultMonth={draftDateRange?.from}
					selected={draftDateRange}
					onSelect={setDraftDateRange}
					numberOfMonths={2}
					disabled={(date) =>
						date < supportedDateRange.start || date > supportedDateRange.end
					}
				/>
				<div className="flex items-center justify-end gap-2 border-t border-border px-3 py-3">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setDraftDateRange(selectedDateRange);
							setOpen(false);
						}}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={!canApplyRange}
						onClick={() => {
							if (!draftDateRange?.from || !draftDateRange.to) {
								return;
							}

							actions.setDateRange(
								formatIsoDate(draftDateRange.from),
								formatIsoDate(draftDateRange.to),
							);
							setOpen(false);
						}}
					>
						Apply
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
