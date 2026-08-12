import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	CodeXml,
	Copy,
	GitBranch,
	ListTree,
	type LucideIcon,
	Maximize2,
	Minimize2,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { SessionAdalineMessageRow } from "./session-adaline-message-rows";
import {
	buildSessionAdalineRawRecord,
	formatSessionAdalineDuration,
	getSessionAdalineMessageSpans,
	getSessionAdalineTurnStatus,
	type SessionAdalineOption,
	type SessionAdalineSpan,
} from "./session-adaline-model";
import { SessionAdalineTraceTree } from "./session-adaline-trace-tree";

const turnCostFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

function DetailIconButton({
	disabled = false,
	icon: Icon,
	label,
	onClick,
}: {
	disabled?: boolean;
	icon: LucideIcon;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-(--session-overview-border) text-(--session-overview-muted) outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent) disabled:pointer-events-none disabled:opacity-35"
			disabled={disabled}
			title={label}
			onClick={onClick}
		>
			<Icon className="size-4 shrink-0 stroke-current" />
			<span
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
			/>
		</button>
	);
}

function getStatusClassName(
	status: ReturnType<typeof getSessionAdalineTurnStatus>,
) {
	switch (status) {
		case "error":
			return "bg-red-500";
		case "pending":
			return "bg-amber-500";
		case "success":
			return "bg-emerald-500";
	}
}

function formatTokenPair(option: SessionAdalineOption) {
	const input = option.metrics.inputTokens;
	const output = option.metrics.outputTokens;
	if (input === undefined && output === undefined) {
		return "—";
	}

	return `${(input ?? 0).toLocaleString()} / ${(output ?? 0).toLocaleString()}`;
}

function SessionAdalineMetrics({
	option,
	row,
	spanCount,
	status,
}: {
	option: SessionAdalineOption;
	row: SessionAdalineMessageRow;
	spanCount: number;
	status: ReturnType<typeof getSessionAdalineTurnStatus>;
}) {
	const metrics = [
		{ label: "Started", value: row.time || "—" },
		{ label: "Run duration", value: option.timing.durationLabel ?? "—" },
		{ label: "Status", value: status },
		{ label: "Events", value: spanCount.toLocaleString() },
		...(row.ownsTurnMetrics
			? [
					{ label: "Input / Output", value: formatTokenPair(option) },
					{
						label: "Cost",
						value:
							option.metrics.estimatedCost === undefined
								? "—"
								: turnCostFormatter.format(option.metrics.estimatedCost),
					},
				]
			: []),
	];

	return (
		<section className="border-b border-(--session-overview-border) px-3 pb-3">
			<h3 className="py-3 text-base font-medium text-(--session-overview-text) sm:text-sm">
				Metrics
			</h3>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-3 @[36rem]:grid-cols-3">
				{metrics.map((metric) => (
					<div key={metric.label} className="min-w-0">
						<dd className="truncate text-base font-medium capitalize text-(--session-overview-text) tabular-nums sm:text-sm">
							{metric.value}
						</dd>
						<dt className="truncate text-base text-(--session-overview-subtle) sm:text-xs">
							{metric.label}
						</dt>
					</div>
				))}
			</dl>
		</section>
	);
}

function SessionAdalineMetadata({ option }: { option: SessionAdalineOption }) {
	const rows = [
		{
			label: "Turn",
			value:
				option.turnNumber === undefined
					? "Session start"
					: option.turnNumber.toLocaleString(),
		},
		{ label: "Tool calls", value: option.toolCallCount.toLocaleString() },
		{ label: "Errors", value: option.metrics.errorCount.toLocaleString() },
		{
			label: "Files",
			value: option.metrics.editedFiles.join(", ") || "None",
		},
		{ label: "Skills", value: option.metrics.skills.join(", ") || "None" },
		{
			label: "Commands",
			value: option.slashCommands.join(", ") || "None",
		},
	];

	return (
		<details className="group border-b border-(--session-overview-border) px-3">
			<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-base font-medium text-(--session-overview-text) outline-none focus-visible:outline-2 focus-visible:outline-(--session-overview-accent) sm:text-sm [&::-webkit-details-marker]:hidden">
				Metadata
				<ChevronRight className="size-4 shrink-0 stroke-(--session-overview-muted) transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
			</summary>
			<dl className="grid gap-2 pb-3">
				{rows.map((row) => (
					<div
						key={row.label}
						className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3"
					>
						<dt className="text-base text-(--session-overview-subtle) sm:text-xs">
							{row.label}
						</dt>
						<dd className="min-w-0 break-words text-base text-(--session-overview-text) sm:text-xs">
							{row.value}
						</dd>
					</div>
				))}
			</dl>
		</details>
	);
}

function SessionAdalineRawInspector({
	option,
	selectedSpan,
}: {
	option: SessionAdalineOption;
	selectedSpan: SessionAdalineSpan | undefined;
}) {
	const [copied, setCopied] = useState(false);
	const rawText = useMemo(
		() =>
			JSON.stringify(
				buildSessionAdalineRawRecord(option, selectedSpan),
				null,
				2,
			),
		[option, selectedSpan],
	);

	function handleCopy() {
		if (typeof navigator.clipboard === "undefined") {
			return;
		}

		void navigator.clipboard.writeText(rawText).then(() => setCopied(true));
	}

	return (
		<section className="flex min-h-64 flex-1 flex-col">
			<header className="flex min-h-11 shrink-0 items-center justify-between border-b border-(--session-overview-border) px-3">
				<div className="flex items-center gap-2">
					<CodeXml className="size-4 shrink-0 stroke-(--session-overview-muted)" />
					<h3 className="text-base font-medium text-(--session-overview-text) sm:text-sm">
						Raw
					</h3>
					<p className="rounded bg-(--session-overview-hover) px-1.5 py-0.5 text-base text-(--session-overview-muted) sm:text-xs">
						JSON
					</p>
				</div>
				<button
					type="button"
					aria-label="Copy raw JSON"
					className="relative flex min-h-8 items-center gap-1.5 rounded-md px-2 text-base text-(--session-overview-muted) outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:outline-(--session-overview-accent) sm:text-xs"
					onClick={handleCopy}
				>
					<Copy className="size-4 shrink-0 stroke-current" />
					{copied ? "Copied" : "Copy"}
					<span
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
					/>
				</button>
			</header>
			<pre className="min-h-0 flex-1 overflow-auto overscroll-none whitespace-pre-wrap break-words p-3 font-mono text-base text-(--session-overview-muted) sm:text-xs">
				{rawText}
			</pre>
		</section>
	);
}

export function SessionAdalineDetailPane({
	maximized,
	nextDisabled,
	onClose,
	onNext,
	onPrevious,
	onToggleMaximized,
	option,
	previousDisabled,
	row,
}: {
	maximized: boolean;
	nextDisabled: boolean;
	onClose: () => void;
	onNext: () => void;
	onPrevious: () => void;
	onToggleMaximized: () => void;
	option: SessionAdalineOption;
	previousDisabled: boolean;
	row: SessionAdalineMessageRow;
}) {
	const spans = useMemo(
		() => getSessionAdalineMessageSpans(option, row),
		[option, row],
	);
	const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>(
		() => spans.at(-1)?.id,
	);
	const selectedSpan = spans.find((span) => span.id === selectedSpanId);
	const [mode, setMode] = useState<"tree" | "waterfall">("tree");
	const status = getSessionAdalineTurnStatus(option);
	const turnTitle =
		option.turnNumber === undefined
			? "Session start"
			: `Turn ${option.turnNumber.toLocaleString()}`;
	const activityLabel =
		row.speaker === "member"
			? "Member message"
			: row.speaker === "model"
				? "Model activity"
				: "Session event";
	const title = `${activityLabel} · ${turnTitle}`;

	return (
		<div className="@container flex size-full min-h-0 flex-col bg-(--session-overview-surface)">
			<header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-(--session-overview-border) px-3">
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-baseline gap-2">
						<h2 className="truncate text-base font-medium text-(--session-overview-text) sm:text-sm">
							{title}
						</h2>
						<p className="truncate text-base text-(--session-overview-subtle) tabular-nums sm:text-xs">
							{spans.length} events · {status} ·{" "}
							{option.timing.durationLabel ?? "—"}
						</p>
					</div>
				</div>
				<div
					role="tablist"
					aria-label="Trace display"
					className="hidden shrink-0 items-center gap-0.5 rounded-md border border-(--session-overview-border) p-0.5 sm:flex"
				>
					{(["tree", "waterfall"] as const).map((nextMode) => (
						<button
							key={nextMode}
							type="button"
							role="tab"
							aria-selected={mode === nextMode}
							className={cn(
								"flex h-7 items-center gap-1 rounded px-2 text-xs font-medium capitalize outline-none focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)",
								mode === nextMode
									? "bg-(--session-overview-text) text-(--session-overview-surface)"
									: "text-(--session-overview-muted) hover:bg-(--session-overview-hover)",
							)}
							onClick={() => setMode(nextMode)}
						>
							{nextMode === "tree" ? (
								<GitBranch className="size-4 shrink-0 stroke-current" />
							) : (
								<ListTree className="size-4 shrink-0 stroke-current" />
							)}
							{nextMode}
						</button>
					))}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<DetailIconButton
						disabled={previousDisabled}
						icon={ChevronLeft}
						label="Previous message"
						onClick={onPrevious}
					/>
					<DetailIconButton
						disabled={nextDisabled}
						icon={ChevronDown}
						label="Next message"
						onClick={onNext}
					/>
					<DetailIconButton
						icon={maximized ? Minimize2 : Maximize2}
						label={maximized ? "Restore panel" : "Maximize panel"}
						onClick={onToggleMaximized}
					/>
					<DetailIconButton icon={X} label="Close detail" onClick={onClose} />
				</div>
			</header>

			<div className="grid min-h-0 flex-1 grid-cols-1 @[44rem]:grid-cols-[minmax(14rem,2fr)_minmax(20rem,3fr)]">
				<section className="flex min-h-64 min-w-0 flex-col border-b border-(--session-overview-border) @[44rem]:min-h-0 @[44rem]:border-r @[44rem]:border-b-0">
					<div className="min-h-0 flex-1 overflow-auto overscroll-none">
						<SessionAdalineTraceTree
							mode={mode}
							onSelect={setSelectedSpanId}
							selectedSpanId={selectedSpanId}
							spans={spans}
						/>
					</div>
				</section>

				<section className="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-none">
					<header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-(--session-overview-border) px-3">
						<span
							className={cn(
								"size-1.5 shrink-0 rounded-full",
								getStatusClassName(selectedSpan?.status ?? status),
							)}
						/>
						<h3 className="min-w-0 flex-1 truncate text-base font-medium text-(--session-overview-text) sm:text-sm">
							{selectedSpan?.label ?? title}
						</h3>
						<p className="shrink-0 text-base text-(--session-overview-muted) tabular-nums sm:text-xs">
							{selectedSpan
								? formatSessionAdalineDuration(selectedSpan.durationMs)
								: (option.timing.durationLabel ?? "—")}
						</p>
					</header>
					<SessionAdalineMetrics
						option={option}
						row={row}
						spanCount={spans.length}
						status={status}
					/>
					<SessionAdalineMetadata option={option} />
					<SessionAdalineRawInspector
						key={selectedSpanId ?? option.key}
						option={option}
						selectedSpan={selectedSpan}
					/>
				</section>
			</div>
		</div>
	);
}
