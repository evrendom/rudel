import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { SessionTurnMetrics } from "./session-turn-metadata";
import { SessionTurnMetadataTags } from "./session-turn-metadata-tags";

type TriptychTurnRailOption = {
	key: string;
	metrics: SessionTurnMetrics;
	preview: string;
	slashCommands: readonly string[];
	timing: {
		durationLabel: string | undefined;
		endTime: string;
		startTime: string;
	};
	toolCallCount: number;
};

export function SessionFactsVisibilityButton({
	controlsId,
	expanded,
	onClick,
}: {
	controlsId: string;
	expanded: boolean;
	onClick: () => void;
}) {
	const label = expanded ? "Hide session facts" : "Show session facts";

	return (
		<button
			type="button"
			aria-controls={controlsId}
			aria-expanded={expanded}
			aria-label={label}
			className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-(--session-overview-muted) outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
			onClick={onClick}
		>
			{expanded ? (
				<PanelLeftClose aria-hidden="true" className="size-4 shrink-0" />
			) : (
				<PanelLeftOpen aria-hidden="true" className="size-4 shrink-0" />
			)}
			<span
				aria-hidden="true"
				className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
			/>
		</button>
	);
}

export function TurnRail({
	onSelect,
	options,
	selectedIndex,
}: {
	onSelect: (index: number) => void;
	options: readonly TriptychTurnRailOption[];
	selectedIndex: number;
}) {
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

	return (
		<nav aria-label="Session turns" onKeyDown={handleKeyDown}>
			{options.length > 0 ? (
				<ol>
					{options.map((option, index) => {
						const selected = index === selectedIndex;
						return (
							<li key={option.key}>
								<button
									type="button"
									aria-pressed={selected}
									data-turn-index={index}
									className={cn(
										"group min-h-[5.5rem] w-full border-b border-(--session-overview-border) px-4 py-3 text-left outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)",
										selected
											? "bg-(--session-overview-hover)"
											: "bg-(--session-overview-surface) hover:bg-(--session-overview-hover)",
									)}
									onClick={() => onSelect(index)}
								>
									<div className="min-w-0">
										{option.timing.startTime ? (
											<div className="flex items-center gap-1.5 text-xs text-(--session-overview-muted) tabular-nums">
												<time>{option.timing.startTime}</time>
												{option.timing.endTime ? (
													<>
														<span aria-hidden="true">→</span>
														<span className="sr-only">to</span>
														<time>{option.timing.endTime}</time>
														{option.timing.durationLabel ? (
															<span
																className="font-medium text-(--session-overview-text)"
																title={`${option.timing.durationLabel} from prompt to final assistant message`}
															>
																+{option.timing.durationLabel}
															</span>
														) : null}
													</>
												) : null}
											</div>
										) : null}
										<p
											className={cn(
												"line-clamp-2 text-[0.8125rem] leading-5 tracking-[-0.01em] text-(--session-overview-muted)",
												option.timing.startTime && "mt-1",
											)}
										>
											{option.preview}
										</p>
										<SessionTurnMetadataTags
											metrics={option.metrics}
											toolCallCount={option.toolCallCount}
										/>
										{option.slashCommands.length > 0 ? (
											<div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
												{option.slashCommands.map((command) => (
													<span
														key={command}
														className="max-w-full truncate rounded-full bg-(--session-overview-hover) px-2 py-0.5 font-mono text-xs text-(--session-overview-text) group-aria-pressed:bg-(--session-overview-surface)"
													>
														{command}
													</span>
												))}
											</div>
										) : null}
									</div>
								</button>
							</li>
						);
					})}
				</ol>
			) : (
				<p className="border-b border-(--session-overview-border) px-5 py-10 text-center text-sm text-(--session-overview-muted)">
					No conversation data available
				</p>
			)}
		</nav>
	);
}
