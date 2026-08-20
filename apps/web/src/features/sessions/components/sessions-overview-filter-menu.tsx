import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { Checkbox } from "@/app/ui/checkbox";
import { Input } from "@/app/ui/input";
import type { SessionOverviewFilterOption } from "@/features/sessions/components/sessions-overview-table-utils";

export function SessionOverviewFilterOptionsPanel({
	excludedValues,
	label,
	onOptionChecked,
	options,
	variant = "default",
}: {
	excludedValues: ReadonlySet<string>;
	label: string;
	onOptionChecked: (value: string, checked: boolean) => void;
	options: readonly SessionOverviewFilterOption[];
	variant?: "default" | "linear" | "linear-side";
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
			{options.length > 8 || variant === "linear-side" ? (
				<div
					className={
						variant !== "default"
							? "relative flex h-9 shrink-0 items-center border-b border-black/6 dark:border-white/8"
							: "relative border-b border-border/60 p-2"
					}
				>
					<label className="sr-only" htmlFor={`${controlId}-search`}>
						{variant === "linear-side"
							? "Filter…"
							: `Search ${label.toLocaleLowerCase()}`}
					</label>
					<HugeiconsIcon
						aria-hidden="true"
						className={
							variant !== "default"
								? "pointer-events-none absolute left-2.5 size-3.5 text-[#7c7c7c]"
								: "pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
						}
						icon={Search01Icon}
						strokeWidth={1.75}
					/>
					<Input
						id={`${controlId}-search`}
						type={variant === "linear-side" ? "search" : "text"}
						name={`${controlId}-search`}
						className={
							variant !== "default"
								? "h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-2 pl-8 text-[0.8125rem]/5 font-[450] shadow-none outline-none placeholder:text-[#7c7c7c] focus-visible:ring-0 dark:bg-transparent"
								: "h-8 rounded-lg bg-muted/60 pr-2 pl-9 text-sm"
						}
						placeholder={
							variant === "linear-side"
								? "Filter…"
								: `Search ${label.toLocaleLowerCase()}`
						}
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
					/>
				</div>
			) : null}
			<div
				className={
					variant === "linear-side"
						? "max-h-[338px] overflow-y-auto overscroll-contain py-1.5 [scrollbar-width:thin]"
						: variant === "linear"
							? "min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5 [scrollbar-width:thin]"
							: "max-h-72 overflow-y-auto overscroll-contain p-1.5"
				}
				data-session-filter-scroll-region="true"
			>
				{visibleOptions.length > 0 ? (
					visibleOptions.map((option, optionIndex) => {
						const optionId = `${controlId}-option-${optionIndex}`;
						const isChecked = !excludedValues.has(option.value);

						return variant !== "default" ? (
							<label
								key={option.value}
								htmlFor={optionId}
								className="flex h-8 w-full items-center gap-2 px-2 text-left text-[0.8125rem]/5 font-[450] text-[#2f2f31] outline-none hover:bg-[#eeeeef] focus-visible:bg-[#eeeeef] dark:text-[#e2e3e5] dark:hover:bg-white/8 dark:focus-visible:bg-white/8"
								title={option.value}
							>
								<input
									id={optionId}
									type="checkbox"
									checked={isChecked}
									className="peer sr-only"
									name={optionId}
									onChange={(event) =>
										onOptionChecked(option.value, event.target.checked)
									}
								/>
								{variant === "linear-side" ? (
									<span className="flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-black/12 bg-[#fcfcfc] text-[#5e69c1] dark:border-white/14 dark:bg-white/6">
										{isChecked ? (
											<HugeiconsIcon
												aria-hidden="true"
												className="size-3"
												icon={Tick02Icon}
												strokeWidth={2}
											/>
										) : null}
									</span>
								) : null}
								<span className="min-w-0 flex-1 truncate">{option.label}</span>
								{variant === "linear" && isChecked ? (
									<HugeiconsIcon
										aria-hidden="true"
										className="size-3.5 shrink-0 text-[#5e69c1]"
										icon={Tick02Icon}
										strokeWidth={2}
									/>
								) : null}
							</label>
						) : (
							<label
								key={option.value}
								htmlFor={optionId}
								className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground"
								title={option.value}
							>
								<Checkbox
									id={optionId}
									checked={isChecked}
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
			{variant === "default" ? (
				<div className="border-t border-border/60 px-3 py-2 text-xs tabular-nums text-muted-foreground">
					{selectedOptionCount.toLocaleString()} of{" "}
					{options.length.toLocaleString()} selected
				</div>
			) : null}
		</>
	);
}
