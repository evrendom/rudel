import {
	ArrowRight01Icon,
	FilterEditIcon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type LinearFilterItem = {
	group: "identity" | "usage" | "activity";
	icon: IconSvgElement;
	key: string;
	label: string;
};

export function LinearActiveFiltersButton({
	count,
	onClick,
}: {
	count: number;
	onClick: () => void;
}) {
	const label = `Review ${count.toLocaleString()} active session ${count === 1 ? "filter" : "filters"}`;

	return (
		<button
			type="button"
			aria-label={label}
			className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-[#5e69c1] outline-none hover:bg-[#ececed] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[#5e69c1] dark:text-[#8b93dc] dark:hover:bg-white/8"
			onClick={onClick}
			title={label}
		>
			<HugeiconsIcon
				aria-hidden="true"
				className="size-4"
				icon={FilterEditIcon}
				strokeWidth={1.7}
			/>
			<span
				aria-hidden="true"
				className="absolute top-1 right-1 size-1.5 rounded-full bg-[#5e69c1] ring-1 ring-[#fcfcfc] dark:bg-[#8b93dc] dark:ring-[#1c1c1d]"
			/>
		</button>
	);
}

export function LinearFilterSearch({
	controlsId,
	onChange,
	value,
}: {
	controlsId: string;
	onChange: (value: string) => void;
	value: string;
}) {
	return (
		<form
			className="relative flex h-9 shrink-0 items-center border-b border-black/6 dark:border-white/8"
			onSubmit={(event) => event.preventDefault()}
		>
			<HugeiconsIcon
				aria-hidden="true"
				className="pointer-events-none absolute left-2.5 size-3.5 text-[#7c7c7c]"
				icon={Search01Icon}
				strokeWidth={1.75}
			/>
			<input
				type="search"
				aria-controls={controlsId}
				aria-label="Add Filter…"
				autoComplete="off"
				className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-7 pl-8 text-[0.8125rem]/5 font-[450] text-[#2f2f31] outline-none placeholder:text-[#7c7c7c] dark:text-[#e2e3e5] [&::-webkit-search-cancel-button]:hidden"
				id={`${controlsId}-search`}
				name="session-filter-search"
				onChange={(event) => onChange(event.target.value)}
				placeholder="Add Filter…"
				spellCheck={false}
				value={value}
			/>
			<kbd className="pointer-events-none absolute right-2 flex size-4 items-center justify-center rounded border border-black/10 bg-transparent font-sans text-[0.6875rem]/4 font-[450] text-[#87888a] dark:border-white/12">
				F
			</kbd>
		</form>
	);
}

export function LinearFilterList<TFilter extends LinearFilterItem>({
	activeFilterKey,
	filters,
	getFilterSummary,
	isFilterActive,
	listId,
	onActivate,
}: {
	activeFilterKey: string | null;
	filters: readonly TFilter[];
	getFilterSummary: (filter: TFilter) => string | null;
	isFilterActive: (filter: TFilter) => boolean;
	listId: string;
	onActivate: (filterKey: TFilter["key"], row: HTMLButtonElement) => void;
}) {
	if (filters.length === 0) {
		return (
			<p className="flex min-h-24 flex-1 items-center justify-center px-4 text-center text-[0.8125rem]/5 font-[450] text-[#7c7c7c]">
				No matching filters
			</p>
		);
	}

	return (
		<div
			className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
			data-session-filter-scroll-region="true"
		>
			<ul id={listId} className="py-1.5">
				{filters.map((filter, index) => {
					const previousFilter = filters[index - 1];
					const showSeparator =
						previousFilter !== undefined &&
						previousFilter.group !== filter.group;
					const isActive = isFilterActive(filter);
					const isPreviewed = activeFilterKey === filter.key;
					const summary = getFilterSummary(filter);

					return (
						<li key={filter.key}>
							{showSeparator ? (
								<div aria-hidden="true" className="flex h-3 items-center px-2">
									<div className="h-px w-full bg-black/6 dark:bg-white/8" />
								</div>
							) : null}
							<button
								type="button"
								aria-label={`Configure ${filter.label} filter`}
								className={cn(
									"group/filter-row flex min-h-8 w-full items-center gap-2 px-2 py-1 text-left text-[0.8125rem]/5 font-[450] text-[#2f2f31] outline-none hover:bg-[#eeeeef] focus-visible:bg-[#eeeeef] dark:text-[#e2e3e5] dark:hover:bg-white/8 dark:focus-visible:bg-white/8",
									isPreviewed && "bg-[#eeeeef] dark:bg-white/8",
								)}
								data-active={isActive ? "true" : undefined}
								onClick={(event) => onActivate(filter.key, event.currentTarget)}
								onFocus={(event) => onActivate(filter.key, event.currentTarget)}
								onMouseEnter={(event) =>
									onActivate(filter.key, event.currentTarget)
								}
							>
								<span
									className={cn(
										"flex size-4 shrink-0 items-center justify-center text-[#5b5c5e] dark:text-[#b8b8ba]",
										isActive && "text-[#5e69c1] dark:text-[#8b93dc]",
									)}
								>
									<HugeiconsIcon
										aria-hidden="true"
										className="size-4"
										icon={filter.icon}
										strokeWidth={1.6}
									/>
								</span>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate">{filter.label}</span>
									{summary ? (
										<span
											className="truncate text-[0.6875rem]/4 font-[450] tabular-nums text-[#5e69c1] dark:text-[#8b93dc]"
											title={summary}
										>
											{summary}
										</span>
									) : null}
								</span>
								<HugeiconsIcon
									aria-hidden="true"
									className="size-3 shrink-0 text-[#87888a]"
									icon={ArrowRight01Icon}
									strokeWidth={2.25}
								/>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
