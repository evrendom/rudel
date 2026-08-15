import { Bot } from "lucide-react";
import {
	ClaudeModelIcon,
	CodexModelIcon,
} from "@/features/dashboard/components/DashboardModelBadges";
import {
	formatModelDisplayLabel,
	getModelBadgeTone,
	getModelIdentityIconClassName,
} from "@/features/dashboard/components/dashboard-model-brand";
import { formatRoundedDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { getSessionOverviewAggregateCounts } from "./session-overview-aggregates";
import type { SessionTurnOption } from "./session-turn-option";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

type SessionStripMetric = {
	label: string;
	value: string;
	tone?: "muted" | "alert";
};

function countTone(count: number): SessionStripMetric["tone"] {
	return count === 0 ? "muted" : undefined;
}

function SessionStripModelIcon({ model }: { model: string | undefined }) {
	const icon = model ? getModelBadgeTone(model).icon : null;
	if (icon === "claude") {
		return (
			<ClaudeModelIcon
				className={cn(
					"size-3.5 shrink-0",
					getModelIdentityIconClassName(model),
				)}
			/>
		);
	}
	if (icon === "codex") {
		return (
			<CodexModelIcon
				className={cn(
					"size-3.5 shrink-0",
					getModelIdentityIconClassName(model),
				)}
			/>
		);
	}

	return (
		<Bot
			aria-hidden="true"
			className="size-3.5 shrink-0 text-(--session-overview-subtle)"
		/>
	);
}

export function SessionOverviewSummaryStrip({
	options,
	viewModel,
}: {
	options: readonly SessionTurnOption[];
	viewModel: SessionDetailViewModel;
}) {
	const counts = getSessionOverviewAggregateCounts(options);
	const metrics: SessionStripMetric[] = [
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
		{
			label: "Tool calls",
			value: counts.toolCallCount.toLocaleString(),
			tone: countTone(counts.toolCallCount),
		},
		{
			label: "Errors",
			value: counts.errorCount.toLocaleString(),
			tone: counts.errorCount > 0 ? "alert" : "muted",
		},
		{
			label: "Files edited",
			value: counts.editedFileCount.toLocaleString(),
			tone: countTone(counts.editedFileCount),
		},
		{
			label: "Skills",
			value: counts.skillCount.toLocaleString(),
			tone: countTone(counts.skillCount),
		},
	];
	const modelLabel = viewModel.safeModelUsed
		? formatModelDisplayLabel(viewModel.safeModelUsed)
		: "Unknown model";

	return (
		<header className="@container flex min-h-13 shrink-0 items-center overflow-hidden bg-(--session-overview-surface) px-3 py-2 [--session-summary-card:#00000006] [--session-summary-label:#00000072] [--session-summary-value:#000000df] dark:[--session-summary-card:#ffffff09] dark:[--session-summary-label:#ffffff64] dark:[--session-summary-value:#ffffffed]">
			<dl
				aria-label="Session details"
				className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain whitespace-nowrap"
			>
				{metrics.map((metric) => (
					<div
						key={metric.label}
						className="flex min-w-max flex-1 flex-col gap-0.5 rounded-2xl bg-(--session-summary-card) px-3 py-2"
					>
						<dt className="truncate font-sans text-base/5 font-medium tracking-[0.05em] text-(--session-summary-label) uppercase sm:text-[0.625rem]/4">
							{metric.label}
						</dt>
						<dd
							className={cn(
								"text-lg/6 font-[450] tabular-nums sm:text-[0.9375rem]/6",
								metric.tone === "alert"
									? "text-red-600 dark:text-red-400"
									: metric.tone === "muted"
										? "text-(--session-summary-label)"
										: "text-(--session-summary-value)",
							)}
						>
							{metric.value}
						</dd>
					</div>
				))}
				<div
					className="hidden min-w-max flex-1 flex-col gap-0.5 rounded-2xl bg-(--session-summary-card) px-3 py-2 @5xl:flex"
					title={modelLabel}
				>
					<dt className="truncate font-sans text-base/5 font-medium tracking-[0.05em] text-(--session-summary-label) uppercase sm:text-[0.625rem]/4">
						Model
					</dt>
					<dd className="flex h-6 min-w-0 items-center gap-1.5 text-lg/6 font-[450] text-(--session-summary-value) sm:text-[0.9375rem]/6">
						<SessionStripModelIcon model={viewModel.safeModelUsed} />
						<p className="max-w-48 truncate">{modelLabel}</p>
					</dd>
				</div>
			</dl>
		</header>
	);
}
