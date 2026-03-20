import { Calendar } from "lucide-react";
import { useEffect, useState } from "react";
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

export function DatePicker({
	startDate,
	endDate,
	onStartDateChange,
	onEndDateChange,
}: DatePickerProps) {
	const [open, setOpen] = useState(false);
	const [tempStartDate, setTempStartDate] = useState(startDate);
	const [tempEndDate, setTempEndDate] = useState(endDate);
	const { trackFilterChange } = useAnalyticsTracking();

	const toAnalyticsKey = (value: string) =>
		value.toLowerCase().replace(/[^a-z0-9]+/g, "_");

	useEffect(() => {
		setTempStartDate(startDate);
		setTempEndDate(endDate);
	}, [startDate, endDate]);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setTempStartDate(startDate);
			setTempEndDate(endDate);
		}
	};

	const handleApply = () => {
		trackFilterChange({
			filterName: "date_range",
			filterCategory: "date",
			changeAction: "set",
			sourceComponent: "date_picker",
			valueKey: "custom",
			affectedScope: "page",
		});
		onStartDateChange(tempStartDate);
		onEndDateChange(tempEndDate);
		setOpen(false);
	};

	const handlePresetClick = (preset: DatePreset) => {
		const { start, end } = preset.getValue();
		trackFilterChange({
			filterName: "date_range",
			filterCategory: "date",
			changeAction: "preset",
			sourceComponent: "date_picker",
			valueKey: toAnalyticsKey(preset.label),
			affectedScope: "page",
		});
		setTempStartDate(start);
		setTempEndDate(end);
		onStartDateChange(start);
		onEndDateChange(end);
		setOpen(false);
	};

	const formatDateRange = () => {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const startStr = start.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
		const endStr = end.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
		return `${startStr} - ${endStr}`;
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button variant="outline" className="gap-2">
					<Calendar className="h-4 w-4 text-muted" />
					<span className="text-sm font-medium">{formatDateRange()}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="end">
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

					<div className="p-4 w-64">
						<div className="space-y-3">
							<div>
								<Label
									htmlFor="date-picker-start"
									className="text-xs text-muted mb-1"
								>
									Start date
								</Label>
								<Input
									id="date-picker-start"
									type="date"
									value={tempStartDate}
									onChange={(e) => setTempStartDate(e.target.value)}
									max={tempEndDate}
								/>
							</div>

							<div>
								<Label
									htmlFor="date-picker-end"
									className="text-xs text-muted mb-1"
								>
									End date
								</Label>
								<Input
									id="date-picker-end"
									type="date"
									value={tempEndDate}
									onChange={(e) => setTempEndDate(e.target.value)}
									min={tempStartDate}
									max={new Date().toISOString().split("T")[0]}
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
			</PopoverContent>
		</Popover>
	);
}
