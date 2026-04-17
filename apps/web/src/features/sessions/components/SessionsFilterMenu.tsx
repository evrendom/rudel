import { FilterIcon } from "lucide-react";
import { Button } from "@/app/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SessionsFilterOption = {
	label: string;
	value: string;
};

function buildButtonLabel(
	baseLabel: string,
	options: SessionsFilterOption[],
	selectedValues: string[],
) {
	if (selectedValues.length === 0 || selectedValues.length === options.length) {
		return baseLabel;
	}

	if (selectedValues.length === 1) {
		const selectedOption = options.find(
			(option) => option.value === selectedValues[0],
		);

		return selectedOption?.label ?? baseLabel;
	}

	return `${baseLabel} - ${selectedValues.length}`;
}

function toggleSelection(
	currentValues: string[],
	value: string,
	checked: boolean,
) {
	if (checked) {
		if (currentValues.includes(value)) {
			return currentValues;
		}

		return [...currentValues, value];
	}

	return currentValues.filter((currentValue) => currentValue !== value);
}

function normalizeSelectionState(
	nextValues: string[],
	options: SessionsFilterOption[],
) {
	if (nextValues.length === options.length) {
		return [];
	}

	return nextValues;
}

export function SessionsFilterMenu({
	label,
	options,
	selectedValues,
	onSelectionChange,
	className,
}: {
	label: string;
	options: SessionsFilterOption[];
	selectedValues: string[];
	onSelectionChange: (nextValues: string[]) => void;
	className?: string;
}) {
	const buttonLabel = buildButtonLabel(label, options, selectedValues);
	const effectiveSelectedValues =
		selectedValues.length === 0
			? options.map((option) => option.value)
			: selectedValues;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className={cn(
							"dashboardy-action-button h-8 w-fit rounded-full border-[color:var(--dashboardy-border)] bg-transparent px-3 text-[13px] font-medium text-[color:var(--dashboardy-heading)] shadow-none",
							className,
						)}
					/>
				}
			>
				<FilterIcon
					data-icon="inline-start"
					className="size-3.5 text-[color:var(--dashboardy-muted)]"
				/>
				{buttonLabel}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56" align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{label}</DropdownMenuLabel>
					<DropdownMenuItem onClick={() => onSelectionChange([])}>
						All
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					{options.map((option) => (
						<DropdownMenuCheckboxItem
							key={option.value}
							checked={effectiveSelectedValues.includes(option.value)}
							onCheckedChange={(checked) =>
								onSelectionChange(
									normalizeSelectionState(
										toggleSelection(
											effectiveSelectedValues,
											option.value,
											Boolean(checked),
										),
										options,
									),
								)
							}
						>
							{option.label}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
