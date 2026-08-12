import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type SessionTurnStripOption = {
	key: string;
	preview: string;
};

type SessionTurnStripProps = {
	activationMode: "pane" | "rail";
	className?: string;
	onSelect: (index: number) => void;
	options: readonly SessionTurnStripOption[];
	selectedIndex: number;
};

function getTurnTextClassName(distance: number) {
	if (distance === 0) {
		return "text-(--session-overview-text)";
	}

	if (distance === 1) {
		return "text-(--session-overview-muted)";
	}

	return "text-(--session-overview-subtle)";
}

export function SessionTurnStrip({
	activationMode,
	className,
	onSelect,
	options,
	selectedIndex,
}: SessionTurnStripProps) {
	function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
			return;
		}

		event.preventDefault();
		const direction = event.key === "ArrowDown" ? 1 : -1;
		const nextIndex = Math.min(
			Math.max(selectedIndex + direction, 0),
			options.length - 1,
		);
		onSelect(nextIndex);
		event.currentTarget
			.querySelector<HTMLButtonElement>(`[data-turn-index="${nextIndex}"]`)
			?.focus();
	}

	if (options.length === 0) {
		return activationMode === "pane" ? (
			<p className="flex min-h-0 flex-1 items-center justify-center px-5 py-10 text-center text-sm text-(--session-overview-muted)">
				No user turns available
			</p>
		) : null;
	}

	const idleRailNaturalHeight = Math.max(options.length * 0.875 - 0.75, 0.125);
	const expandedRailNaturalHeight = Math.max(options.length * 2.5 + 2.25, 16);
	const railActivated = activationMode === "rail";

	return (
		<nav
			aria-label="Session turn navigator"
			className={cn(
				"group relative outline-none [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]",
				railActivated
					? "pointer-events-none hidden h-full w-14 shrink-0 border-l border-(--session-overview-border) transition-[width] duration-200 ease-out has-[:hover]:w-[22rem] has-[:focus-visible]:w-[22rem] lg:block"
					: "min-h-0 flex-1",
				className,
			)}
			onKeyDown={handleKeyDown}
		>
			<div
				aria-hidden="true"
				className={cn(
					"absolute inset-y-0 right-0 flex w-14 items-center justify-center opacity-100 transition-opacity duration-200 ease-out group-has-[:focus-visible]:opacity-0",
					railActivated
						? "pointer-events-auto group-has-[:hover]:opacity-0"
						: "group-hover:opacity-0",
				)}
			>
				<div
					className="flex flex-col justify-between"
					style={{
						height: `min(${idleRailNaturalHeight}rem, calc(100% - 1.5rem))`,
					}}
				>
					{options.map((option, index) => {
						const selected = index === selectedIndex;

						return (
							<div key={option.key} className="flex h-0.5 w-4 justify-end">
								<div
									className={cn(
										"h-0.5 w-4 rounded-full",
										selected
											? "bg-(--session-overview-text) shadow-[0_0_4px_var(--session-overview-text)]"
											: "bg-(--session-overview-subtle)",
									)}
								/>
							</div>
						);
					})}
				</div>
			</div>

			<div
				className={cn(
					"pointer-events-none absolute inset-4 flex items-center justify-center opacity-0 transition-opacity duration-200 ease-out group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100",
					railActivated
						? "group-has-[:hover]:pointer-events-auto group-has-[:hover]:opacity-100"
						: "group-hover:pointer-events-auto group-hover:opacity-100",
				)}
			>
				<div
					className="flex w-full max-w-[19rem] flex-col overflow-hidden rounded-[min(2vw,var(--radius-3xl))] border border-(--session-overview-border) bg-(--session-overview-surface) p-5"
					style={{ height: `min(${expandedRailNaturalHeight}rem, 100%)` }}
				>
					<ol className="grid min-h-0 w-full flex-1 gap-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(16,17,18,0.2)_transparent] [scrollbar-gutter:stable]">
						{options.map((option, index) => {
							const selected = index === selectedIndex;
							const distance = Math.abs(index - selectedIndex);

							return (
								<li key={option.key} className="min-w-0">
									<button
										type="button"
										aria-label={`Turn ${index + 1}: ${option.preview}`}
										aria-pressed={selected}
										className={cn(
											"min-h-9 w-full truncate rounded-md px-2 py-2 text-left text-sm font-medium tracking-[-0.01em] outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
											getTurnTextClassName(distance),
											selected && "bg-(--session-overview-hover)",
										)}
										data-turn-index={index}
										onClick={() => onSelect(index)}
										title={option.preview}
									>
										{option.preview}
									</button>
								</li>
							);
						})}
					</ol>
				</div>
			</div>
		</nav>
	);
}
