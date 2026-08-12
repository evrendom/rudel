import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { formatRoundedDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	getSessionAdalineAggregateCounts,
	type SessionAdalineOption,
} from "./session-adaline-model";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export function SessionAdalineSessionStrip({
	hideTopBorder = false,
	options,
	viewModel,
}: {
	hideTopBorder?: boolean;
	options: readonly SessionAdalineOption[];
	viewModel: SessionDetailViewModel;
}) {
	const counts = getSessionAdalineAggregateCounts(options);
	const metrics = [
		{ label: "Turns", value: counts.turnCount.toLocaleString() },
		{
			label: "Duration",
			value: formatRoundedDuration(viewModel.safeDurationMin),
		},
		{ label: "Cost", value: viewModel.costLabel },
		{
			label: "Input tokens",
			value: viewModel.safeInputTokens.toLocaleString(),
		},
		{
			label: "Output tokens",
			value: viewModel.safeOutputTokens.toLocaleString(),
		},
		{ label: "Tool calls", value: counts.toolCallCount.toLocaleString() },
		{ label: "Errors", value: counts.errorCount.toLocaleString() },
		{ label: "Files edited", value: counts.editedFileCount.toLocaleString() },
		{ label: "Skills", value: counts.skillCount.toLocaleString() },
	];
	const modelLabel = viewModel.safeModelUsed
		? formatModelDisplayLabel(viewModel.safeModelUsed)
		: "Unknown model";

	return (
		<header
			className={cn(
				"flex min-h-12 shrink-0 items-center gap-4 overflow-hidden border-b border-(--session-overview-border) bg-(--session-overview-hover) px-3",
				!hideTopBorder && "border-t",
			)}
		>
			<dl
				aria-label="Session details"
				className="flex min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain whitespace-nowrap"
			>
				{metrics.map((metric) => (
					<div
						key={metric.label}
						className="flex shrink-0 items-baseline gap-1.5 border-l border-(--session-overview-border) px-3 first:border-l-0 first:pl-0 last:pr-0"
					>
						<dt className="text-base text-(--session-overview-muted) sm:text-sm">
							{metric.label}
						</dt>
						<dd className="text-base font-medium text-(--session-overview-text) tabular-nums sm:text-sm">
							{metric.value}
						</dd>
					</div>
				))}
			</dl>
			<div className="hidden shrink-0 items-center gap-1.5 text-sm text-(--session-overview-muted) xl:flex">
				<span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
				<p className="max-w-48 truncate">{modelLabel}</p>
			</div>
		</header>
	);
}
