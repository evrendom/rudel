import { Search } from "lucide-react";
import { useId, useState } from "react";
import { Checkbox } from "@/app/ui/checkbox";
import { Input } from "@/app/ui/input";
import type { SessionOverviewFilterOption } from "@/features/sessions/components/sessions-overview-table-utils";

export function SessionOverviewFilterOptionsPanel({
	excludedValues,
	label,
	onOptionChecked,
	options,
}: {
	excludedValues: ReadonlySet<string>;
	label: string;
	onOptionChecked: (value: string, checked: boolean) => void;
	options: readonly SessionOverviewFilterOption[];
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const controlId = useId();
	const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
	const visibleOptions = options.filter(
		(option) =>
			normalizedSearchQuery.length === 0 ||
			option.label.toLocaleLowerCase().includes(normalizedSearchQuery) ||
			option.value.toLocaleLowerCase().includes(normalizedSearchQuery),
	);
	const selectedOptionCount = options.reduce(
		(count, option) => count + (excludedValues.has(option.value) ? 0 : 1),
		0,
	);

	return (
		<>
			{options.length > 8 ? (
				<div className="relative border-b border-border/60 p-2">
					<label className="sr-only" htmlFor={`${controlId}-search`}>
						Search {label.toLocaleLowerCase()}
					</label>
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						id={`${controlId}-search`}
						name={`${controlId}-search`}
						className="h-8 rounded-lg bg-muted/60 pr-2 pl-9 text-sm"
						placeholder={`Search ${label.toLocaleLowerCase()}`}
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
					/>
				</div>
			) : null}
			<div className="max-h-72 overflow-y-auto p-1.5">
				{visibleOptions.length > 0 ? (
					visibleOptions.map((option, optionIndex) => {
						const optionId = `${controlId}-option-${optionIndex}`;

						return (
							<label
								key={option.value}
								htmlFor={optionId}
								className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground"
								title={option.value}
							>
								<Checkbox
									id={optionId}
									checked={!excludedValues.has(option.value)}
									onCheckedChange={(checked) =>
										onOptionChecked(option.value, Boolean(checked))
									}
								/>
								<span className="min-w-0 truncate">{option.label}</span>
							</label>
						);
					})
				) : (
					<p className="px-3 py-6 text-center text-sm text-muted-foreground">
						No options found.
					</p>
				)}
			</div>
			<div className="border-t border-border/60 px-3 py-2 text-xs tabular-nums text-muted-foreground">
				{selectedOptionCount.toLocaleString()} of{" "}
				{options.length.toLocaleString()} selected
			</div>
		</>
	);
}
