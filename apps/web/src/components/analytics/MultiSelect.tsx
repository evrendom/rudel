import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
	options: string[];
	selected: string[];
	onChange: (selected: string[]) => void;
	placeholder?: string;
	className?: string;
}

export function MultiSelect({
	options,
	selected,
	onChange,
	placeholder = "Select items...",
	className = "",
}: MultiSelectProps) {
	const [open, setOpen] = useState(false);
	const { trackFilterChange } = useAnalyticsTracking();
	const filterName = placeholder.toLowerCase().replace(/[^a-z0-9]+/g, "_");

	const toggleOption = (option: string) => {
		trackFilterChange({
			filterName,
			filterCategory: "multi_select",
			changeAction: selected.includes(option) ? "remove" : "add",
			sourceComponent: filterName,
			selectionCount: selected.includes(option)
				? Math.max(selected.length - 1, 0)
				: selected.length + 1,
			valueKey: option,
			affectedScope: "page",
		});
		if (selected.includes(option)) {
			onChange(selected.filter((item) => item !== option));
		} else {
			onChange([...selected, option]);
		}
	};

	const clearAll = (e: React.MouseEvent) => {
		e.stopPropagation();
		trackFilterChange({
			filterName,
			filterCategory: "multi_select",
			changeAction: "clear",
			sourceComponent: filterName,
			selectionCount: 0,
			affectedScope: "page",
		});
		onChange([]);
	};

	const displayText =
		selected.length === 0
			? placeholder
			: selected.length === 1
				? selected[0]
				: `${selected.length} selected`;

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-between gap-2",
						className,
					)}
				>
					<span
						className={cn("truncate", selected.length === 0 && "text-muted")}
					>
						{selected.length > 0 && (
							<Check className="w-3 h-3 inline mr-1 text-status-success-icon" />
						)}
						{displayText}
					</span>
					<div className="flex items-center gap-1">
						{selected.length > 0 && (
							<button
								type="button"
								onClick={clearAll}
								className="p-0.5 hover:bg-hover rounded"
								title="Clear all"
							>
								<X className="w-3 h-3 text-muted" />
							</button>
						)}
						<ChevronDown
							className={cn(
								"w-4 h-4 text-muted transition-transform",
								open && "rotate-180",
							)}
						/>
					</div>
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[var(--radix-popover-trigger-width)] p-0"
				align="start"
			>
				{options.length === 0 ? (
					<div className="px-3 py-2 text-sm text-muted text-center">
						No options available
					</div>
				) : (
					<div className="max-h-60 overflow-y-auto">
						{options.map((option) => {
							const isSelected = selected.includes(option);
							return (
								<button
									key={option}
									type="button"
									onClick={() => toggleOption(option)}
									className={cn(
										"w-full px-3 py-2 text-sm text-left hover:bg-hover flex items-center gap-2",
										isSelected && "bg-accent-light",
									)}
								>
									<Checkbox
										checked={isSelected}
										tabIndex={-1}
										className="pointer-events-none"
									/>
									<span
										className={cn(
											isSelected
												? "font-medium text-accent-text"
												: "text-foreground",
										)}
									>
										{option}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
