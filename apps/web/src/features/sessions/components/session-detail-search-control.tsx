import type { SessionDetailTurn } from "@rudel/api-routes";
import { SearchIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import { Input } from "@/app/ui/input";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import {
	type SessionDetailSearchLoadState,
	searchSessionDetailTurns,
} from "./session-detail-search";

const MAX_VISIBLE_SEARCH_RESULTS = 50;

export function SessionDetailSearchControl({
	bodies,
	loadState,
	onCancel,
	onFocus,
	onSelectResult,
	options,
}: {
	bodies: ReadonlyMap<string, SessionDetailTurn>;
	loadState: SessionDetailSearchLoadState;
	onCancel: () => void;
	onFocus: () => void;
	onSelectResult: (index: number) => void;
	options: readonly SessionDetailOverviewTurnOption[];
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [focused, setFocused] = useState(false);
	const [query, setQuery] = useState("");
	const results = useMemo(
		() => searchSessionDetailTurns({ bodies, options, query }),
		[bodies, options, query],
	);

	useMountEffect(() => {
		const handleFindShortcut = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
				event.preventDefault();
				inputRef.current?.focus();
				inputRef.current?.select();
			}
		};
		document.addEventListener("keydown", handleFindShortcut);
		return () => document.removeEventListener("keydown", handleFindShortcut);
	});

	const normalizedQuery = query.trim();
	return (
		<div
			ref={containerRef}
			className="relative ml-auto flex min-w-0 items-center gap-2"
			onBlurCapture={(event) => {
				if (!containerRef.current?.contains(event.relatedTarget)) {
					setFocused(false);
				}
			}}
		>
			<div className="relative w-52 min-w-0 sm:w-64">
				<SearchIcon
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--session-overview-subtle)"
				/>
				<Input
					ref={inputRef}
					aria-label="Search session transcript"
					className="h-8 rounded-md border-(--session-overview-border) bg-(--session-overview-hover) pr-3 pl-8 text-xs"
					placeholder="Search transcript"
					type="search"
					value={query}
					onChange={(event) => setQuery(event.currentTarget.value)}
					onFocus={() => {
						setFocused(true);
						onFocus();
					}}
				/>
			</div>
			<SearchLoadProgress loadState={loadState} onCancel={onCancel} />
			{focused && normalizedQuery ? (
				<div className="absolute top-[calc(100%+0.375rem)] right-0 z-40 max-h-80 w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) p-1 shadow-lg">
					{results.length === 0 ? (
						<p className="px-3 py-4 text-center text-xs text-(--session-overview-muted)">
							{loadState.status === "loading"
								? "Searching as turns load…"
								: "No matching turns"}
						</p>
					) : (
						results.slice(0, MAX_VISIBLE_SEARCH_RESULTS).map((result) => (
							<button
								key={result.turnId}
								className="block w-full rounded-sm px-3 py-2 text-left hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)"
								type="button"
								onClick={() => {
									onSelectResult(result.index);
									setFocused(false);
								}}
							>
								<span className="block text-xs font-medium text-(--session-overview-text)">
									{result.turnNumber === undefined
										? "Session start"
										: `Turn ${result.turnNumber.toLocaleString()}`}
								</span>
								<span className="mt-0.5 block line-clamp-2 text-xs text-(--session-overview-muted)">
									{result.snippet}
								</span>
							</button>
						))
					)}
				</div>
			) : null}
		</div>
	);
}

function SearchLoadProgress({
	loadState,
	onCancel,
}: {
	loadState: SessionDetailSearchLoadState;
	onCancel: () => void;
}) {
	if (loadState.status === "idle") {
		return null;
	}
	if (loadState.status === "loading") {
		const label =
			loadState.phase === "pages"
				? "Indexing turns…"
				: `${loadState.completed.toLocaleString()}/${loadState.total.toLocaleString()}`;
		return (
			<div className="flex shrink-0 items-center gap-1">
				<output className="text-[0.6875rem] text-(--session-overview-muted)">
					{label}
				</output>
				<Button
					aria-label="Cancel transcript indexing"
					className="size-7"
					onClick={onCancel}
					size="icon"
					type="button"
					variant="ghost"
				>
					<XIcon aria-hidden="true" className="size-3.5" />
				</Button>
			</div>
		);
	}
	if (loadState.status === "failed") {
		return (
			<output className="shrink-0 text-[0.6875rem] text-(--session-overview-muted)">
				{loadState.failedTurnIds.length.toLocaleString()} unavailable
			</output>
		);
	}
	if (loadState.status === "cancelled") {
		return (
			<output className="shrink-0 text-[0.6875rem] text-(--session-overview-muted)">
				Paused {loadState.completed.toLocaleString()}/
				{loadState.total.toLocaleString()}
			</output>
		);
	}
	return (
		<output className="shrink-0 text-[0.6875rem] text-(--session-overview-muted)">
			Indexed
		</output>
	);
}
