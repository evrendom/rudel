import { parseISO } from "date-fns";
import { Calendar } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";

interface DatePickerProps {
	startDate: string;
	endDate: string;
	onStartDateChange: (date: string) => void;
	onEndDateChange: (date: string) => void;
}

interface DatePickerPanelProps extends DatePickerProps {
	onApplyComplete: () => void;
	trackPresetSelection: (presetLabel: string) => void;
	trackCustomSelection: () => void;
}

interface DatePreset {
	label: string;
	getValue: () => { start: string; end: string };
}

const formatLocalDate = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const DATE_PRESETS: DatePreset[] = [
	{
		label: "Last 7 days",
		getValue: () => {
			const end = new Date();
			const start = new Date();
			start.setDate(start.getDate() - 7);
			return { start: formatLocalDate(start), end: formatLocalDate(end) };
		},
	},
	{
		label: "This week",
		getValue: () => {
			const now = new Date();
			const dayOfWeek = now.getDay();
			const start = new Date(now);
			start.setDate(now.getDate() - dayOfWeek);
			return {
				start: formatLocalDate(start),
				end: formatLocalDate(now),
			};
		},
	},
	{
		label: "Last week",
		getValue: () => {
			const now = new Date();
			const dayOfWeek = now.getDay();
			const start = new Date(now);
			start.setDate(now.getDate() - dayOfWeek - 7);
			const end = new Date(start);
			end.setDate(start.getDate() + 6);
			return {
				start: formatLocalDate(start),
				end: formatLocalDate(end),
			};
		},
	},
	{
		label: "Last 30 days",
		getValue: () => {
			const end = new Date();
			const start = new Date();
			start.setDate(start.getDate() - 30);
			return { start: formatLocalDate(start), end: formatLocalDate(end) };
		},
	},
	{
		label: "This month",
		getValue: () => {
			const now = new Date();
			const start = new Date(now.getFullYear(), now.getMonth(), 1);
			return {
				start: formatLocalDate(start),
				end: formatLocalDate(now),
			};
		},
	},
	{
		label: "Last month",
		getValue: () => {
			const now = new Date();
			const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			const end = new Date(now.getFullYear(), now.getMonth(), 0);
			return {
				start: formatLocalDate(start),
				end: formatLocalDate(end),
			};
		},
	},
];

function formatDateRange(startDate: string, endDate: string) {
	const start = parseISO(startDate);
	const end = parseISO(endDate);
	const startLabel = start.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
	const endLabel = end.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	return `${startLabel} - ${endLabel}`;
}

function DatePickerPanel({
	endDate,
	onApplyComplete,
	onEndDateChange,
	onStartDateChange,
	startDate,
	trackCustomSelection,
	trackPresetSelection,
}: DatePickerPanelProps) {
	const [draftStartDate, setDraftStartDate] = useState(startDate);
	const [draftEndDate, setDraftEndDate] = useState(endDate);

	function handleApply() {
		trackCustomSelection();
		onStartDateChange(draftStartDate);
		onEndDateChange(draftEndDate);
		onApplyComplete();
	}

	function handlePresetClick(preset: DatePreset) {
		const { end, start } = preset.getValue();

		trackPresetSelection(preset.label);
		onStartDateChange(start);
		onEndDateChange(end);
		onApplyComplete();
	}

	return (
		<div className="flex overflow-hidden">
			<div className="w-40 border-r border-border bg-surface">
				{DATE_PRESETS.map((preset) => (
					<button
						key={preset.label}
						type="button"
						onClick={() => handlePresetClick(preset)}
						className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent-light hover:text-accent-text transition-colors"
					>
						{preset.label}
					</button>
				))}
			</div>

			<div className="w-64 p-4">
				<div className="space-y-3">
					<div>
						<Label
							htmlFor="date-picker-start"
							className="mb-1 text-xs text-muted"
						>
							Start date
						</Label>
						<Input
							id="date-picker-start"
							type="date"
							value={draftStartDate}
							onChange={(event) => setDraftStartDate(event.target.value)}
							max={draftEndDate}
						/>
					</div>

					<div>
						<Label
							htmlFor="date-picker-end"
							className="mb-1 text-xs text-muted"
						>
							End date
						</Label>
						<Input
							id="date-picker-end"
							type="date"
							value={draftEndDate}
							onChange={(event) => setDraftEndDate(event.target.value)}
							min={draftStartDate}
							max={formatLocalDate(new Date())}
						/>
					</div>

					<div className="pt-2">
						<Button className="w-full" onClick={handleApply}>
							Apply
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export function DatePicker({
	startDate,
	endDate,
	onStartDateChange,
	onEndDateChange,
}: DatePickerProps) {
	const [open, setOpen] = useState(false);
	const { trackFilterChange } = useAnalyticsTracking();

	const toAnalyticsKey = (value: string) =>
		value.toLowerCase().replace(/[^a-z0-9]+/g, "_");

	function trackCustomSelection() {
		trackFilterChange({
			filterName: "date_range",
			filterCategory: "date",
			changeAction: "set",
			sourceComponent: "date_picker",
			valueKey: "custom",
			affectedScope: "page",
		});
	}

	function trackPresetSelection(presetLabel: string) {
		trackFilterChange({
			filterName: "date_range",
			filterCategory: "date",
			changeAction: "preset",
			sourceComponent: "date_picker",
			valueKey: toAnalyticsKey(presetLabel),
			affectedScope: "page",
		});
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" className="gap-2">
					<Calendar className="h-4 w-4 text-muted" />
					<span className="text-sm font-medium">
						{formatDateRange(startDate, endDate)}
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="end">
				<DatePickerPanel
					key={`${startDate}:${endDate}`}
					startDate={startDate}
					endDate={endDate}
					onStartDateChange={onStartDateChange}
					onEndDateChange={onEndDateChange}
					onApplyComplete={() => setOpen(false)}
					trackCustomSelection={trackCustomSelection}
					trackPresetSelection={trackPresetSelection}
				/>
			</PopoverContent>
		</Popover>
	);
}
