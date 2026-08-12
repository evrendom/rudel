import type { SessionTurnLensId } from "./session-turn-lenses";
import { formatSessionTurnMetricValue } from "./session-turn-metric";
import type { SessionTurnTableOption } from "./session-turn-table";

function formatTokens(value: number | undefined) {
	return formatSessionTurnMetricValue(value, "input");
}

export function SessionTurnStickyHeader({
	activeLensId,
	leadingControl,
	option,
}: {
	activeLensId: SessionTurnLensId | undefined;
	leadingControl?: ReactNode;
	option: SessionTurnTableOption | undefined;
}) {
	const turnLabel =
		option?.turnNumber === undefined
			? "Session start"
			: `Turn ${option.turnNumber}`;

	return (
		<header className="flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3 text-xs text-(--session-overview-muted)">
			{leadingControl}
			<strong className="shrink-0 font-medium text-(--session-overview-text)">
				{turnLabel}
			</strong>
			{option ? (
				<>
					<span aria-hidden="true">·</span>
					<time className="shrink-0 tabular-nums">
						{option.timing.startTime || "Time unavailable"}
					</time>
					<span aria-hidden="true">·</span>
					<span className="shrink-0 tabular-nums">
						{formatSessionTurnMetricValue(option.metrics.estimatedCost, "cost")}
					</span>
					<span aria-hidden="true">·</span>
					<span className="shrink-0 tabular-nums">
						{formatTokens(option.metrics.inputTokens)} in /{" "}
						{formatTokens(option.metrics.outputTokens)} out
					</span>
					<span aria-hidden="true">·</span>
					<span className="shrink-0 tabular-nums">
						{option.toolCallCount.toLocaleString()} tools
					</span>
					{option.metrics.skills.map((skill) => (
						<span
							key={skill}
							className="shrink-0 rounded-full bg-(--session-overview-hover) px-2 py-0.5 font-mono text-[0.6875rem] text-(--session-overview-text)"
						>
							{skill}
						</span>
					))}
				</>
			) : null}
			{activeLensId ? (
				<span className="ml-auto shrink-0 rounded-full bg-[color-mix(in_srgb,var(--session-overview-accent)_10%,var(--session-overview-surface))] px-2 py-0.5 font-medium text-(--session-overview-accent)">
					{activeLensId} lens
				</span>
			) : null}
		</header>
	);
}

import type { ReactNode } from "react";
