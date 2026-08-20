"use client";

import { CalendarIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ChevronProps, DateRange } from "react-day-picker";
import { Button } from "@/app/ui/button";
import { Calendar } from "@/app/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { Separator } from "@/app/ui/separator";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
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
	variant?: "default" | "linear";
};

const LINEAR_CHEVRON_PATH = {
	left: "M10.53033 11.4697C10.82322 11.7626 10.82322 12.2374 10.53033 12.5303C10.23744 12.8232 9.76256 12.8232 9.46967 12.5303L5.46967 8.53033C5.1793 8.23999 5.1764 7.77014 5.4632 7.47624L9.36581 3.47624C9.65508 3.17976 10.12991 3.17391 10.42639 3.46318C10.72287 3.75244 10.72872 4.22728 10.43946 4.52376L7.05417 7.99351L10.53033 11.4697Z",
	right:
		"M5.46967 11.4697C5.17678 11.7626 5.17678 12.2374 5.46967 12.5303C5.76256 12.8232 6.23744 12.8232 6.53033 12.5303L10.5303 8.53033C10.8207 8.23999 10.8236 7.77014 10.5368 7.47624L6.63419 3.47624C6.34492 3.17976 5.87009 3.17391 5.57361 3.46318C5.27713 3.75244 5.27128 4.22728 5.56054 4.52376L8.94583 7.99351L5.46967 11.4697Z",
};

function LinearCalendarChevron({
	className,
	disabled,
	orientation = "right",
	size = 16,
}: ChevronProps) {
	const pointsLeft = orientation === "left";
	const rotatesUp = orientation === "up";
	const rotatesDown = orientation === "down";

	return (
		<svg
			aria-hidden="true"
			focusable="false"
			role="img"
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="currentColor"
			className={cn(
				"size-4",
				rotatesUp && "-rotate-90",
				rotatesDown && "rotate-90",
				disabled && "opacity-50",
				className,
			)}
		>
			<path
				d={pointsLeft ? LINEAR_CHEVRON_PATH.left : LINEAR_CHEVRON_PATH.right}
			/>
		</svg>
	);
}

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
	variant = "default",
}: AnalyticsDateRangePickerProps) {
	const { trackFilterChange } = useAnalyticsTracking();
	const [open, setOpen] = useState(false);
	const popoverScrollRegionRef = useRef<HTMLDivElement>(null);
	const wheelHandlerRef = useRef((event: WheelEvent) => {
		const scrollRegion = popoverScrollRegionRef.current;
		if (!scrollRegion) {
			return;
		}

		event.stopPropagation();
		const hasVerticalOverflow =
			scrollRegion.scrollHeight > scrollRegion.clientHeight + 1;
		const isScrollingUp = event.deltaY < 0;
		const isScrollingDown = event.deltaY > 0;
		const isAtTop = scrollRegion.scrollTop <= 0;
		const isAtBottom =
			scrollRegion.scrollTop + scrollRegion.clientHeight >=
			scrollRegion.scrollHeight - 1;
		const isHorizontalGesture = Math.abs(event.deltaX) > Math.abs(event.deltaY);

		if (
			!hasVerticalOverflow ||
			isHorizontalGesture ||
			(isScrollingUp && isAtTop) ||
			(isScrollingDown && isAtBottom) ||
			(!isScrollingUp && !isScrollingDown)
		) {
			event.preventDefault();
		}
	});
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
	const isLinear = variant === "linear";

	function resetDraftDateRange() {
		setDraftDateRange(selectedDateRange);
	}

	function setPopoverScrollRegion(node: HTMLDivElement | null) {
		const previousNode = popoverScrollRegionRef.current;
		if (previousNode === node) {
			return;
		}

		previousNode?.removeEventListener("wheel", wheelHandlerRef.current);
		popoverScrollRegionRef.current = node;
		node?.addEventListener("wheel", wheelHandlerRef.current, {
			passive: false,
		});
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
				ref={isLinear ? undefined : setPopoverScrollRegion}
				align={align}
				sideOffset={8}
				className={cn(
					"max-h-[calc(100svh-2rem)] w-fit max-w-[calc(100vw-2rem)] gap-0 p-0",
					isLinear
						? "overflow-hidden overscroll-none rounded-xl border border-[#e1e1e1] bg-[#fcfcfc] text-[#1b1b1b] shadow-[0_10px_30px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.08)] ring-0 dark:border-white/12 dark:bg-[#1c1c1d] dark:text-[#f4f4f5]"
						: "overflow-x-hidden overflow-y-auto overscroll-contain rounded-[28px]",
					contentClassName,
				)}
			>
				{isLinear ? (
					<form
						className="flex min-h-0 flex-col overflow-hidden"
						onSubmit={(event) => {
							event.preventDefault();
							applyDraftDateRange();
						}}
					>
						<div
							ref={setPopoverScrollRegion}
							data-linear-calendar-scroll-region=""
							className="flex min-h-0 flex-col overflow-y-auto overscroll-contain md:flex-row"
						>
							<div className="flex w-full shrink-0 flex-col gap-0.5 p-3 md:w-36">
								{presets.map((preset) => {
									const isActive = preset.id === activePresetId;

									return (
										<button
											key={preset.id}
											type="button"
											aria-pressed={isActive}
											className={cn(
												"flex h-7 w-full items-center rounded-lg px-2 text-left text-[0.8125rem]/4 font-[500] text-[#5b5c5e] outline-none hover:bg-[#eeeeef] focus-visible:ring-1 focus-visible:ring-[#5e69c1] dark:text-[#b8b8ba] dark:hover:bg-white/8",
												isActive &&
													"bg-[#dedede] text-[#1b1b1b] dark:bg-white/12 dark:text-white",
											)}
											onClick={() => applyPreset(preset)}
										>
											<span className="truncate">{preset.label}</span>
										</button>
									);
								})}
							</div>
							<div className="h-px shrink-0 bg-[#e1e1e1] md:h-auto md:w-px dark:bg-white/10" />
							<div className="min-w-0 p-4">{renderCalendar(true)}</div>
						</div>
						<div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e1e1e1] px-4 py-3 dark:border-white/10">
							{renderFooterButtons(true)}
						</div>
					</form>
				) : (
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
											onClick={() => applyPreset(preset)}
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
							<div className="p-3 sm:p-5">{renderCalendar(false)}</div>
							<Separator />
							<div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-5">
								{renderFooterButtons(false)}
							</div>
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);

	function applyPreset(preset: (typeof presets)[number]) {
		const resolvedRange = preset.resolveRange(today);
		handlePresetApply(
			resolvedRange.startDate,
			resolvedRange.endDate,
			preset.id,
			"preset",
		);
	}

	function applyDraftDateRange() {
		if (!draftDateRange?.from || !draftDateRange.to) {
			return;
		}

		handlePresetApply(
			formatIsoDate(draftDateRange.from),
			formatIsoDate(draftDateRange.to),
			"custom",
			"set",
		);
	}

	function renderCalendar(linear: boolean) {
		return (
			<Calendar
				mode="range"
				defaultMonth={draftDateRange?.from}
				selected={draftDateRange}
				onSelect={setDraftDateRange}
				today={today}
				weekStartsOn={linear ? 1 : undefined}
				showOutsideDays={!linear}
				numberOfMonths={2}
				fixedWeeks={linear}
				data-date-picker={linear ? "true" : undefined}
				data-multiple-months={linear ? "true" : undefined}
				components={linear ? { Chevron: LinearCalendarChevron } : undefined}
				modifiers={linear ? { day_weekends: { dayOfWeek: [0, 6] } } : undefined}
				modifiersClassNames={
					linear
						? {
								day_weekends:
									"rdp-day_weekends text-[#9c9c9e] data-[selected=true]:text-inherit",
							}
						: undefined
				}
				className={cn(
					"bg-transparent",
					linear
						? "w-full px-0 pt-2 pb-0 text-xs font-[450] text-[#2f2f31] [--cell-radius:9999px] [--cell-size:32px] md:h-[298px] [&_.rdp-range_end]:bg-[#dedede] [&_.rdp-range_end]:after:bg-[#dedede] [&_.rdp-range_start]:bg-[#dedede] [&_.rdp-range_start]:after:bg-[#dedede] [&_button[data-day]]:rounded-full [&_button[data-day]]:text-[0.8125rem] [&_button[data-day]]:font-[500] [&_button[data-day]:hover]:bg-[#dedede] [&_button[data-range-end=true]]:bg-[#6d78d5] [&_button[data-range-end=true]]:text-[#fefeff] [&_button[data-range-end=true]:hover]:bg-[#5e69c1] [&_button[data-range-middle=true]]:rounded-none [&_button[data-range-middle=true]]:bg-[#dedede] [&_button[data-range-middle=true]]:text-[#2f2f31] [&_button[data-range-start=true]]:bg-[#6d78d5] [&_button[data-range-start=true]]:text-[#fefeff] [&_button[data-range-start=true]:hover]:bg-[#5e69c1] [&_td[data-today=true]]:rounded-full [&_td[data-today=true]]:bg-[#dedede] [&_td[data-today=true]]:text-[#2f2f31]"
						: "p-0",
				)}
				classNames={
					linear
						? {
								button_next:
									"inline-flex size-7 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-[#5b5c5e] outline-none hover:bg-[#eeeeef]",
								button_previous:
									"inline-flex size-7 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-[#5b5c5e] outline-none hover:bg-[#eeeeef]",
								caption_label: "text-[0.8125rem]/5 font-[500] text-[#1b1b1b]",
								month: "flex min-w-0 flex-1 flex-col gap-2.5",
								month_caption:
									"flex h-8 w-full items-center justify-start px-0",
								months:
									"relative flex flex-col gap-5 md:flex-row md:gap-[0.96rem]",
								nav: "absolute top-0 right-0 z-20 flex items-center gap-0.5",
								week: "mt-1 flex w-full",
								weekday: "flex-1 text-xs/4 font-[450] text-[#5b5c5e]",
							}
						: {
								month: "flex w-full flex-col gap-3",
								month_caption:
									"flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
								months: "relative flex flex-col gap-5 md:flex-row",
							}
				}
				disabled={(date) =>
					date < supportedDateRange.start || date > supportedDateRange.end
				}
			/>
		);
	}

	function renderFooterButtons(linear: boolean) {
		return (
			<>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(
						linear &&
							"h-7 rounded-lg px-2.5 text-[0.8125rem] font-[500] text-[#5b5c5e] hover:bg-[#eeeeef]",
					)}
					onClick={() => {
						resetDraftDateRange();
						setOpen(false);
					}}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					size="sm"
					className={cn(
						linear &&
							"h-7 rounded-lg bg-[#1b1b1b] px-2.5 text-[0.8125rem] font-[500] text-white hover:bg-[#373737]",
					)}
					disabled={!canApplyRange}
					onClick={linear ? undefined : applyDraftDateRange}
				>
					Apply
				</Button>
			</>
		);
	}
}
