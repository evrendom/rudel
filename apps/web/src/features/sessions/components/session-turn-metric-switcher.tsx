import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import {
	SESSION_TURN_METRICS,
	type SessionTurnMetric,
} from "./session-turn-metric";

export function SessionTurnMetricSwitcher({
	metric,
	onChange,
}: {
	metric: SessionTurnMetric;
	onChange: (metric: SessionTurnMetric) => void;
}) {
	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}
		event.preventDefault();
		const currentIndex = SESSION_TURN_METRICS.findIndex(
			(option) => option.key === metric,
		);
		const direction = event.key === "ArrowRight" ? 1 : -1;
		const nextIndex =
			(currentIndex + direction + SESSION_TURN_METRICS.length) %
			SESSION_TURN_METRICS.length;
		const nextMetric = SESSION_TURN_METRICS[nextIndex]?.key ?? metric;
		onChange(nextMetric);
		event.currentTarget
			.querySelector<HTMLButtonElement>(`[data-metric="${nextMetric}"]`)
			?.focus();
	}

	return (
		<div
			role="tablist"
			aria-label="Session metric"
			className="flex shrink-0 items-center rounded-md bg-(--session-overview-hover) p-0.5"
			onKeyDown={handleKeyDown}
		>
			{SESSION_TURN_METRICS.map((option) => {
				const selected = option.key === metric;
				return (
					<button
						key={option.key}
						type="button"
						role="tab"
						aria-selected={selected}
						className={cn(
							"relative h-7 rounded-sm px-2 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
							selected
								? "bg-(--session-overview-surface) text-(--session-overview-text)"
								: "text-(--session-overview-muted) hover:text-(--session-overview-text)",
						)}
						data-metric={option.key}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(option.key)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
