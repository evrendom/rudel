import type { ReactNode } from "react";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { formatRoundedDuration } from "@/lib/format";
import { formatExactDateTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionInteractionCounts } from "./session-interaction-counts";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

type Fact = {
	label: string;
	title: string | undefined;
	value: ReactNode;
};

const capabilityChipClassName =
	"inline-flex max-w-full items-center rounded-full bg-(--session-overview-hover) px-2 py-0.5 text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)";

function formatCompactTokenCount(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}

	if (value < 1_000_000) {
		return `${Math.round(value / 1_000)}k`;
	}

	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

function formatSource(source: string | undefined) {
	if (source === "claude_code") {
		return "Claude Code";
	}

	if (source === "codex") {
		return "Codex";
	}

	return source ?? "Not recorded";
}

function formatOptionalDate(value: string | undefined) {
	return value ? formatExactDateTime(value) : "Not recorded";
}

function SectionHeading({ children }: { children: ReactNode }) {
	return (
		<h2 className="flex h-8 items-center border-b border-(--session-overview-border) bg-(--session-overview-hover) px-4 text-xs font-medium tracking-[-0.005em] text-(--session-overview-subtle)">
			{children}
		</h2>
	);
}

function FactList({ facts }: { facts: Fact[] }) {
	return (
		<dl className="divide-y divide-(--session-overview-border)">
			{facts.map((fact) => (
				<div
					key={fact.label}
					className="grid min-h-9 grid-cols-[6.25rem_minmax(0,1fr)] items-start gap-3 px-4 py-2"
				>
					<dt className="text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)">
						{fact.label}
					</dt>
					<dd
						className="min-w-0 break-words text-sm leading-5 font-normal tracking-[-0.01em] text-(--session-overview-muted)"
						title={fact.title}
					>
						{fact.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

export function TriptychContextPanel({
	viewModel,
}: {
	viewModel: SessionDetailViewModel;
}) {
	const {
		safeGitBranch,
		safeGitSha,
		safeLastInteractionDate,
		safeModelUsed,
		safeProjectPath,
		safeRepository,
		safeSessionDate,
		safeSource,
		safeUserDisplayName,
	} = viewModel;
	const sessionFacts: Fact[] = [
		{
			label: "Model",
			title: safeModelUsed,
			value: safeModelUsed
				? formatModelDisplayLabel(safeModelUsed)
				: "Not recorded",
		},
		{
			label: "User",
			title: safeUserDisplayName,
			value: safeUserDisplayName,
		},
		{
			label: "Source",
			title: undefined,
			value: formatSource(safeSource),
		},
		{
			label: "Started",
			title: undefined,
			value: formatOptionalDate(safeSessionDate || undefined),
		},
		{
			label: "Last active",
			title: undefined,
			value: formatOptionalDate(safeLastInteractionDate),
		},
	];
	const environmentFacts: Fact[] = [
		{
			label: "Repository",
			title: safeRepository ?? undefined,
			value: safeRepository ?? "Not recorded",
		},
		{
			label: "Branch",
			title: safeGitBranch ?? undefined,
			value: safeGitBranch ?? "Not recorded",
		},
		{
			label: "Commit",
			title: safeGitSha ?? undefined,
			value: safeGitSha ? (
				<span className="font-mono">{safeGitSha.slice(0, 8)}</span>
			) : (
				"Not recorded"
			),
		},
		{
			label: "Project path",
			title: safeProjectPath,
			value: safeProjectPath ?? "Not recorded",
		},
	];

	return (
		<>
			<section className="border-t border-(--session-overview-border) first:border-t-0">
				<SectionHeading>Session</SectionHeading>
				<FactList facts={sessionFacts} />
			</section>
			<section className="border-t border-(--session-overview-border) first:border-t-0">
				<SectionHeading>Environment</SectionHeading>
				<FactList facts={environmentFacts} />
			</section>
		</>
	);
}

export function TriptychOutcomePanel({
	userImageUrl,
	viewModel,
}: {
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const metrics: Fact[] = [
		{
			label: "Duration",
			title: undefined,
			value: formatRoundedDuration(viewModel.safeDurationMin),
		},
		{
			label: "Interactions",
			title: undefined,
			value: (
				<SessionInteractionCounts
					className="flex shrink-0 items-start gap-3"
					model={viewModel.safeModelUsed}
					modelMessageCount={viewModel.conversationSummary?.assistantMessages}
					userDisplayName={viewModel.safeUserDisplayName}
					userImageUrl={userImageUrl}
					userMessageCount={viewModel.conversationSummary?.userMessages}
				/>
			),
		},
		{
			label: "Input tokens",
			title: viewModel.safeInputTokens.toLocaleString(),
			value: formatCompactTokenCount(viewModel.safeInputTokens),
		},
		{
			label: "Output tokens",
			title: viewModel.safeOutputTokens.toLocaleString(),
			value: formatCompactTokenCount(viewModel.safeOutputTokens),
		},
		{
			label: "Total tokens",
			title: viewModel.safeTotalTokens.toLocaleString(),
			value: formatCompactTokenCount(viewModel.safeTotalTokens),
		},
		{
			label: "Success score",
			title: undefined,
			value:
				viewModel.safeSuccessScore === undefined
					? "—"
					: `${Math.round(viewModel.safeSuccessScore)}%`,
		},
		{
			label: "Estimated cost",
			title: undefined,
			value: viewModel.costLabel,
		},
	];

	return (
		<section className="border-t border-(--session-overview-border) first:border-t-0">
			<SectionHeading>Activity &amp; usage</SectionHeading>
			<FactList facts={metrics} />
		</section>
	);
}

function CapabilityGroup({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<div className="grid grid-cols-[6.25rem_minmax(0,1fr)] items-start gap-3 border-b border-(--session-overview-border) px-4 py-2.5">
			<h3 className="text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)">
				{label}
			</h3>
			<div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
		</div>
	);
}

function EmptyCapability() {
	return (
		<span className="text-sm tracking-[-0.01em] text-(--session-overview-muted)">
			Not used
		</span>
	);
}

export function TriptychCapabilitiesPanel({
	viewModel,
}: {
	viewModel: SessionDetailViewModel;
}) {
	const skills = [...new Set(viewModel.safeSkills)];
	const commands = [...new Set(viewModel.safeSlashCommands)];

	return (
		<section className="border-t border-(--session-overview-border) first:border-t-0">
			<SectionHeading>Capabilities</SectionHeading>
			<div>
				<CapabilityGroup label="Skills">
					{skills.length > 0 ? (
						skills.map((skill) => (
							<span
								key={skill}
								className={cn(capabilityChipClassName, "font-mono")}
								title={skill}
							>
								<span className="truncate">{skill}</span>
							</span>
						))
					) : (
						<EmptyCapability />
					)}
				</CapabilityGroup>
				<CapabilityGroup label="Commands">
					{commands.length > 0 ? (
						commands.map((command) => {
							const label = command.startsWith("/") ? command : `/${command}`;
							return (
								<span
									key={command}
									className={cn(capabilityChipClassName, "font-mono")}
								>
									{label}
								</span>
							);
						})
					) : (
						<EmptyCapability />
					)}
				</CapabilityGroup>
				<CapabilityGroup label="Subagents">
					{viewModel.subagentSummaries.length > 0 ? (
						viewModel.subagentSummaries.map((subagent, index) => {
							const model = subagent.model
								? formatModelDisplayLabel(subagent.model)
								: "Unknown model";
							const tokens =
								subagent.totalTokens === undefined
									? "tokens unavailable"
									: `${formatCompactTokenCount(subagent.totalTokens)} tokens`;

							return (
								<span
									key={subagent.id}
									className={cn(capabilityChipClassName, "gap-1.5")}
									title={`${model}, ${tokens}`}
								>
									<span className="font-mono text-(--session-overview-muted) tabular-nums">
										{String(index + 1).padStart(2, "0")}
									</span>
									<span className="truncate">{model}</span>
								</span>
							);
						})
					) : (
						<EmptyCapability />
					)}
				</CapabilityGroup>
			</div>
		</section>
	);
}
