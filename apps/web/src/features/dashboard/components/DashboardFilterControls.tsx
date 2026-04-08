import { Sparkles, Users } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useMemo, useState } from "react";
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
import { dashboardUserOptions } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

const DASHBOARD_USER_OPTIONS = [...dashboardUserOptions];
const DASHBOARD_MODEL_OPTIONS = ["Opus", "Sonnet 4", "Haiku"];

function buildFilterButtonLabel(
	baseLabel: string,
	selectedValues: string[],
	allValues: string[],
) {
	if (
		selectedValues.length === 0 ||
		selectedValues.length === allValues.length
	) {
		return baseLabel;
	}

	if (selectedValues.length === 1) {
		return selectedValues[0] ?? baseLabel;
	}

	return `${baseLabel} · ${selectedValues.length}`;
}

function setSelectionState(
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

function DashboardFilterMenu({
	icon,
	label,
	options,
	selectedValues,
	setSelectedValues,
	buttonClassName,
}: {
	icon: ReactNode;
	label: string;
	options: string[];
	selectedValues: string[];
	setSelectedValues: Dispatch<SetStateAction<string[]>>;
	buttonClassName?: string;
}) {
	const buttonLabel = buildFilterButtonLabel(label, selectedValues, options);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className={cn(
							"dashboardy-action-button h-8 w-fit rounded-full border-[color:var(--dashboardy-border)] bg-transparent px-3 text-xs font-medium text-[color:var(--dashboardy-heading)] shadow-none sm:h-8 sm:text-[13px]",
							buttonClassName,
						)}
					/>
				}
			>
				{icon}
				{buttonLabel}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56" align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{label}</DropdownMenuLabel>
					<DropdownMenuItem onClick={() => setSelectedValues(options)}>
						All
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setSelectedValues([])}>
						None
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					{options.map((option) => {
						const isSelected = selectedValues.includes(option);

						return (
							<DropdownMenuCheckboxItem
								key={option}
								checked={isSelected}
								onCheckedChange={(checked) =>
									setSelectedValues((currentValues) =>
										setSelectionState(currentValues, option, Boolean(checked)),
									)
								}
							>
								{option}
							</DropdownMenuCheckboxItem>
						);
					})}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function DashboardFilterControls({
	className,
	buttonClassName,
}: {
	className?: string;
	buttonClassName?: string;
}) {
	const [selectedUsers, setSelectedUsers] = useState<string[]>(
		DASHBOARD_USER_OPTIONS,
	);
	const [selectedModels, setSelectedModels] = useState<string[]>(
		DASHBOARD_MODEL_OPTIONS,
	);

	const controls = useMemo(
		() => [
			{
				icon: (
					<Users
						data-icon="inline-start"
						className="size-3.5 text-muted-foreground"
					/>
				),
				label: "Users",
				options: DASHBOARD_USER_OPTIONS,
				selectedValues: selectedUsers,
				setSelectedValues: setSelectedUsers,
			},
			{
				icon: (
					<Sparkles
						data-icon="inline-start"
						className="size-3.5 text-muted-foreground"
					/>
				),
				label: "Models",
				options: DASHBOARD_MODEL_OPTIONS,
				selectedValues: selectedModels,
				setSelectedValues: setSelectedModels,
			},
		],
		[selectedModels, selectedUsers],
	);

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			{controls.map((control) => (
				<DashboardFilterMenu
					key={control.label}
					icon={control.icon}
					label={control.label}
					options={control.options}
					selectedValues={control.selectedValues}
					setSelectedValues={control.setSelectedValues}
					buttonClassName={buttonClassName}
				/>
			))}
		</div>
	);
}
