import {
	Brain,
	FileOutput,
	type LucideIcon,
	MessageSquare,
	Settings2,
	User,
	Wrench,
} from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
	formatSessionAdalineDuration,
	type SessionAdalineSpan,
} from "./session-adaline-model";

type TraceRowStyle = CSSProperties & {
	"--span-indent": string;
};

type WaterfallBarStyle = CSSProperties & {
	"--span-left": string;
	"--span-width": string;
};

function getSpanIcon(kind: SessionAdalineSpan["kind"]): LucideIcon {
	switch (kind) {
		case "member":
			return User;
		case "reasoning":
			return Brain;
		case "message":
			return MessageSquare;
		case "tool":
			return Wrench;
		case "result":
			return FileOutput;
		case "system":
			return Settings2;
	}
}

function getStatusClassName(status: SessionAdalineSpan["status"]) {
	switch (status) {
		case "error":
			return "bg-red-500";
		case "pending":
			return "bg-amber-500";
		case "success":
			return "bg-emerald-500";
	}
}

function parseTimestamp(value: string | undefined) {
	if (!value) {
		return undefined;
	}

	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

function getWaterfallRange(spans: readonly SessionAdalineSpan[]) {
	const timestamps = spans.flatMap((span) => {
		const start = parseTimestamp(span.timestamp);
		if (start === undefined) {
			return [];
		}

		return [start, start + (span.durationMs ?? 0)];
	});
	if (timestamps.length === 0) {
		return { end: 1, start: 0 };
	}

	return {
		end: Math.max(...timestamps),
		start: Math.min(...timestamps),
	};
}

function SessionAdalineTraceRow({
	mode,
	onSelect,
	selected,
	span,
	waterfallEnd,
	waterfallStart,
}: {
	mode: "tree" | "waterfall";
	onSelect: (spanId: string) => void;
	selected: boolean;
	span: SessionAdalineSpan;
	waterfallEnd: number;
	waterfallStart: number;
}) {
	const Icon = getSpanIcon(span.kind);
	const rowStyle: TraceRowStyle = {
		"--span-indent": `${12 + span.depth * 18}px`,
	};
	const spanStart = parseTimestamp(span.timestamp) ?? waterfallStart;
	const totalDuration = Math.max(waterfallEnd - waterfallStart, 1);
	const left = ((spanStart - waterfallStart) / totalDuration) * 100;
	const width = Math.max(((span.durationMs ?? 0) / totalDuration) * 100, 2);
	const waterfallStyle: WaterfallBarStyle = {
		"--span-left": `${Math.min(Math.max(left, 0), 98)}%`,
		"--span-width": `${Math.min(width, 100 - left)}%`,
	};

	return (
		<li>
			<button
				type="button"
				aria-pressed={selected}
				className={cn(
					"group grid min-h-12 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md pr-2 pl-(--span-indent) text-left outline-none hover:bg-(--session-overview-hover) focus-visible:outline-2 focus-visible:outline-(--session-overview-accent) sm:min-h-10",
					selected &&
						"bg-[color-mix(in_srgb,var(--session-overview-accent)_11%,var(--session-overview-surface))]",
				)}
				style={rowStyle}
				onClick={() => onSelect(span.id)}
			>
				<div className="flex min-w-0 items-center gap-2">
					<Icon className="size-4 h-lh shrink-0 stroke-(--session-overview-muted)" />
					<span
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							getStatusClassName(span.status),
						)}
					/>
					<div className="min-w-0">
						<p className="truncate text-base font-medium text-(--session-overview-text) sm:text-sm">
							{span.label}
						</p>
						<p className="truncate text-base text-(--session-overview-subtle) sm:text-xs">
							{span.preview}
						</p>
					</div>
				</div>
				{mode === "tree" ? (
					<p className="text-base text-(--session-overview-muted) tabular-nums sm:text-xs">
						{formatSessionAdalineDuration(span.durationMs)}
					</p>
				) : (
					<div className="relative h-5 w-24 shrink-0 overflow-hidden rounded bg-(--session-overview-hover)">
						<span
							aria-hidden="true"
							className={cn(
								"absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-(--session-overview-accent) left-(--span-left) w-(--span-width)",
								span.status === "error" && "bg-red-500",
							)}
							style={waterfallStyle}
						/>
					</div>
				)}
			</button>
		</li>
	);
}

export function SessionAdalineTraceTree({
	mode,
	onSelect,
	selectedSpanId,
	spans,
}: {
	mode: "tree" | "waterfall";
	onSelect: (spanId: string) => void;
	selectedSpanId: string | undefined;
	spans: readonly SessionAdalineSpan[];
}) {
	const waterfallRange = getWaterfallRange(spans);

	return spans.length > 0 ? (
		<ol className="grid list-none gap-0.5 p-2">
			{spans.map((span) => (
				<SessionAdalineTraceRow
					key={span.id}
					mode={mode}
					onSelect={onSelect}
					selected={span.id === selectedSpanId}
					span={span}
					waterfallEnd={waterfallRange.end}
					waterfallStart={waterfallRange.start}
				/>
			))}
		</ol>
	) : (
		<div className="flex min-h-48 items-center justify-center px-6 text-center">
			<p className="text-base text-(--session-overview-muted) sm:text-sm">
				No trace events recorded for this turn.
			</p>
		</div>
	);
}
