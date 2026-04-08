"use client";

import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/app/ui/button";
import { Calendar } from "@/app/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { getSupportedAnalyticsDateRange } from "@/lib/analytics-date-range";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	formatDashboardDateRangeTriggerLabel,
	getAnalyticsDatePresets,
	parseIsoDateOnly,
	resolveMatchingAnalyticsPreset,
} from "../date-presets";

export type AnalyticsDateRangePickerProps = {
	startDate: string;
	endDate: string;
	onDateRangeApply: (startDate: string, endDate: string) => void;
	triggerClassName?: string;
	contentClassName?: string;
	align?: "start" | "center" | "end";
	sourceComponent?: string;
};

function getValidDateRange(
	startDate: string,
	endDate: string,
): DateRange | undefined {
	const fromDate = parseIsoDateOnly(startDate);
	const toDate = parseIsoDateOnly(endDate);

	if (!fromDate || !toDate) {
		return undefined;
	}

	return {
		from: fromDate,
		to: toDate,
	};
}

export function AnalyticsDateRangePicker({
	startDate,
	endDate,
	onDateRangeApply,
	triggerClassName,
	contentClassName,
	align = "end",
	sourceComponent,
}: AnalyticsDateRangePickerProps) {
	const { trackFilterChange } = useAnalyticsTracking();
	const [open, setOpen] = useState(false);
	const today = new Date();
	const supportedDateRange = getSupportedAnalyticsDateRange(today);
	const selectedDateRange = useMemo(
		() => getValidDateRange(startDate, endDate),
		[endDate, startDate],
	);
	const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>(
		selectedDateRange,
	);
	const presets = getAnalyticsDatePresets();
	const activePresetId =
		resolveMatchingAnalyticsPreset(startDate, endDate, today)?.id ?? null;
	const canApplyRange = Boolean(draftDateRange?.from && draftDateRange.to);
	const displayValue =
		selectedDateRange?.from && selectedDateRange.to
			? formatDashboardDateRangeTriggerLabel(startDate, endDate)
			: "Pick a date";
	const analyticsSourceComponent =
		sourceComponent ?? "analytics_date_range_picker";

	function resetDraftDateRange() {
		setDraftDateRange(selectedDateRange);
	}

	function handlePresetApply(
		resolvedStartDate: string,
		resolvedEndDate: string,
		valueKey: string,
		changeAction: string,
	) {
		trackFilterChange({
			filterName: "date_range",
			filterCategory: "date",
			changeAction,
			sourceComponent: analyticsSourceComponent,
			valueKey,
			affectedScope: "page",
		});
		onDateRangeApply(resolvedStartDate, resolvedEndDate);
		setOpen(false);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				resetDraftDateRange();
			}}
		>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className={cn(
							"h-9 justify-start rounded-full border-border bg-background/90 px-3 text-sm font-medium text-foreground shadow-none",
							triggerClassName,
						)}
					/>
				}
			>
				<CalendarIcon data-icon="inline-start" />
				{displayValue}
			</PopoverTrigger>
			<PopoverContent
				align={align}
				sideOffset={8}
				className={cn(
					"w-fit max-w-[92vw] gap-0 overflow-hidden rounded-[28px] p-0",
					contentClassName,
				)}
			>
				<div className="flex flex-col md:flex-row">
					<div className="flex w-full flex-col gap-1 p-3 md:w-48 md:p-4">
						<div className="flex flex-col gap-1">
							{presets.map((preset) => {
								const isActive = preset.id === activePresetId;

								return (
									<Button
										key={preset.id}
										type="button"
										variant={isActive ? "secondary" : "ghost"}
										size="sm"
										className="w-full justify-start rounded-2xl px-3 text-sm"
										onClick={() => {
											const resolvedRange = preset.resolveRange(today);

											handlePresetApply(
												resolvedRange.startDate,
												resolvedRange.endDate,
												preset.id,
												"preset",
											);
										}}
									>
										{preset.label}
									</Button>
								);
							})}
						</div>
					</div>
					<Separator orientation="horizontal" className="mx-4 md:hidden" />
					<Separator orientation="vertical" className="hidden md:block" />
					<div className="flex min-w-0 flex-col">
						<div className="p-3 sm:p-5">
							<Calendar
								mode="range"
								defaultMonth={draftDateRange?.from}
								selected={draftDateRange}
								onSelect={setDraftDateRange}
								today={today}
								numberOfMonths={2}
								className="bg-transparent p-0"
								classNames={{
									months: "relative flex flex-col gap-5 md:flex-row",
									month: "flex w-full flex-col gap-3",
									month_caption:
										"flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
								}}
								disabled={(date) =>
									date < supportedDateRange.start ||
									date > supportedDateRange.end
								}
							/>
						</div>
						<Separator />
						<div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-5">
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => {
										resetDraftDateRange();
										setOpen(false);
									}}
								>
									Cancel
								</Button>
								<Button
									type="button"
									size="sm"
									disabled={!canApplyRange}
									onClick={() => {
										if (!draftDateRange?.from || !draftDateRange.to) {
											return;
										}

										handlePresetApply(
											formatIsoDate(draftDateRange.from),
											formatIsoDate(draftDateRange.to),
											"custom",
											"set",
										);
									}}
								>
									Apply
								</Button>
							</div>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
