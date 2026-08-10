import { ListFilter, Search } from "lucide-react";
import { useId, useState } from "react";
import { Checkbox } from "@/app/ui/checkbox";
import { Input } from "@/app/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@/app/ui/popover";
import type { SessionOverviewFilterOption } from "@/features/sessions/components/sessions-overview-table-utils";
import { cn } from "@/lib/utils";

export function SessionOverviewFilterMenu({
	excludedChildValues,
	excludedValues,
	label,
	onClear,
	onOptionChecked,
	onChildOptionChecked,
	options,
}: {
	excludedChildValues: ReadonlySet<string> | undefined;
	excludedValues: ReadonlySet<string>;
	label: string;
	onClear: () => void;
	onOptionChecked: (value: string, checked: boolean) => void;
	onChildOptionChecked: ((value: string, checked: boolean) => void) | undefined;
	options: readonly SessionOverviewFilterOption[];
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const controlId = useId();
	const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
	const visibleOptions = options.flatMap((option) => {
		const optionMatches =
			normalizedSearchQuery.length === 0 ||
			option.label.toLocaleLowerCase().includes(normalizedSearchQuery) ||
			option.value.toLocaleLowerCase().includes(normalizedSearchQuery);
		const visibleWorktrees = optionMatches
			? option.worktrees
			: option.worktrees.filter(
					(worktree) =>
						worktree.label
							.toLocaleLowerCase()
							.includes(normalizedSearchQuery) ||
						worktree.value.toLocaleLowerCase().includes(normalizedSearchQuery),
				);

		return optionMatches || visibleWorktrees.length > 0
			? [{ ...option, worktrees: visibleWorktrees }]
			: [];
	});
	const selectedOptionCount = options.reduce(
		(count, option) => count + (excludedValues.has(option.value) ? 0 : 1),
		0,
	);
	const excludedChildCount = excludedChildValues?.size ?? 0;
	const isActive = excludedValues.size > 0 || excludedChildCount > 0;
	const childExclusionLabel = `${excludedChildCount} ${
		excludedChildCount === 1 ? "worktree" : "worktrees"
	} excluded`;
	const triggerLabel = isActive
		? `Filter by ${label}, ${selectedOptionCount} of ${options.length} selected${
				excludedChildCount > 0 ? `, ${childExclusionLabel}` : ""
			}`
		: `Filter by ${label}`;

	return (
		<Popover
			open={isOpen}
			onOpenChange={(nextOpen) => {
				setIsOpen(nextOpen);
				if (!nextOpen) {
					setSearchQuery("");
				}
			}}
		>
			<PopoverTrigger
				type="button"
				aria-label={triggerLabel}
				title={triggerLabel}
				className={cn(
					"relative flex h-full w-10 shrink-0 items-center justify-center border-l border-(--session-overview-border) text-(--session-overview-muted) outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)",
					isActive &&
						"bg-(--session-overview-hover) text-(--session-overview-accent)",
				)}
			>
				<ListFilter aria-hidden="true" className="size-4" />
				{isActive ? (
					<span
						aria-hidden="true"
						className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-(--session-overview-accent) ring-2 ring-(--session-overview-surface)"
					/>
				) : null}
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={5}
				className="w-72 gap-0 overflow-hidden rounded-2xl p-0"
			>
				<div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
					<PopoverTitle className="truncate text-sm font-semibold">
						Filter by {label}
					</PopoverTitle>
					<button
						type="button"
						aria-label={`Clear ${label} filter`}
						className="rounded-md px-1.5 py-1 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40"
						disabled={!isActive}
						onClick={onClear}
					>
						Clear
					</button>
				</div>
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
							const isOptionChecked = !excludedValues.has(option.value);

							return (
								<div key={option.value}>
									<label
										htmlFor={optionId}
										className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground"
										title={option.value}
									>
										<Checkbox
											id={optionId}
											checked={isOptionChecked}
											onCheckedChange={(checked) =>
												onOptionChecked(option.value, Boolean(checked))
											}
										/>
										<span className="min-w-0 truncate">{option.label}</span>
									</label>
									{option.worktrees.map((worktree, worktreeIndex) => {
										const worktreeId = `${optionId}-worktree-${worktreeIndex}`;

										return (
											<label
												key={worktree.value}
												htmlFor={worktreeId}
												className="ml-5 flex min-h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50"
												title={worktree.value}
											>
												<Checkbox
													id={worktreeId}
													checked={
														isOptionChecked &&
														!(excludedChildValues?.has(worktree.value) ?? false)
													}
													disabled={!isOptionChecked}
													onCheckedChange={(checked) =>
														onChildOptionChecked?.(
															worktree.value,
															Boolean(checked),
														)
													}
												/>
												<span className="min-w-0 truncate">
													{worktree.label}
												</span>
											</label>
										);
									})}
								</div>
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
					{excludedChildCount > 0 ? ` · ${childExclusionLabel}` : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
