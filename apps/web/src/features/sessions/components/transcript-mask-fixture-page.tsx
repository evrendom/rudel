import { ConversationTrace } from "@/components/conversation/ConversationTrace";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import {
	buildConversationTraceFixtureTurns,
	CONVERSATION_TRACE_FIXTURE_AGENT_LABEL,
	CONVERSATION_TRACE_FIXTURE_MODEL,
	CONVERSATION_TRACE_FIXTURE_USER_LABEL,
} from "@/components/conversation/conversation-trace-fixture";
import "@/features/dashboard/dashboard-theme.css";
import { SessionContinuousTurnSkeleton } from "./session-continuous-turn-skeleton";
import "./session-constellation-tree.css";
import "./session-transcript-mask.css";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

const MASK_SKELETON_OPTION = {
	compactionsBefore: [],
	key: "transcript-mask-skeleton",
	memberPreview: "No member message",
	metrics: {
		editedFiles: [],
		errorCount: 0,
		errorEvents: [],
		estimatedCost: 0,
		inputTokens: 0,
		outputTokens: 0,
		skillEvents: [],
		skills: [],
		usageEvents: [],
	},
	preview: "Loading response",
	slashCommands: [],
	timing: {
		durationLabel: undefined,
		durationSeconds: undefined,
		endTime: "10:02",
		startTime: "10:00",
	},
	toolCallCount: 1,
	turnNumber: 1,
} satisfies SessionTurnTablePaneOption;

const MASK_COLLAPSED_TRACE_ITEMS = buildMaskCollapsedTraceItems();

function buildMaskCollapsedTraceItems(): TraceItem[] {
	const agentItem = buildConversationTraceFixtureTurns()
		.flatMap((turn) => turn.items)
		.find((item) => item.kind === "agent");
	const reasoningEvent = agentItem?.events.find(
		(event) => event.kind === "reasoning",
	);
	if (!(agentItem && reasoningEvent)) {
		return [];
	}
	return [
		{ ...agentItem, events: [reasoningEvent], id: "transcript-mask-row" },
	];
}

const SESSION_THEME_CLASS_NAME =
	"[--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]";

export function TranscriptMaskFixturePage() {
	return (
		<main className="transcript-mask-demo dashboardy-page grid h-dvh min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-(--dashboardy-surface-opaque) font-sans text-(--dashboardy-heading)">
			<header className="flex min-h-12 items-center justify-between border-b border-(--dashboardy-border) px-4">
				<div>
					<h1 className="text-sm font-semibold">Transcript gap texture</h1>
					<p className="text-xs text-(--dashboardy-body-muted)">
						The exposed panes are the production scroll surface with no rows.
					</p>
				</div>
				<label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium">
					<input
						className="size-4"
						data-transcript-mask-toggle
						type="checkbox"
					/>
					Overlay real rows
				</label>
			</header>
			<div className="grid min-h-0 grid-cols-2">
				<MaskPane label="Light" />
				<div className="dark min-h-0">
					<MaskPane label="Dark" />
				</div>
			</div>
		</main>
	);
}

function MaskPane({ label }: { label: string }) {
	return (
		<section
			className={`dashboardy-page relative h-full min-h-0 overflow-hidden bg-(--session-overview-surface) ${SESSION_THEME_CLASS_NAME}`}
			data-transcript-mask-theme={label.toLowerCase()}
		>
			<div className="pointer-events-none absolute top-3 left-4 z-10 rounded bg-(--session-overview-surface) px-2 py-1 text-xs font-medium text-(--session-overview-muted) shadow-sm">
				{label}
			</div>
			<section
				aria-label={`${label} transcript texture`}
				className="session-constellation-tree session-transcript-mask h-full min-h-0 overflow-y-auto overscroll-contain bg-(--session-overview-surface) [overflow-anchor:none] [scrollbar-gutter:stable]"
				data-conversation-trace-scroll-container
				data-transcript-mask-exposed
			>
				<div aria-hidden className="h-[200vh]" />
			</section>
			<div
				className="session-transcript-row-surface absolute inset-x-4 top-14 z-20 max-h-[calc(100%-4.5rem)] overflow-hidden rounded-md border border-(--session-overview-border) shadow-sm"
				data-transcript-mask-overlay
			>
				<SessionContinuousTurnSkeleton
					continuesThread
					option={MASK_SKELETON_OPTION}
					userLabel={CONVERSATION_TRACE_FIXTURE_USER_LABEL}
				/>
				<ConversationTrace
					agentLabel={CONVERSATION_TRACE_FIXTURE_AGENT_LABEL}
					agentModel={CONVERSATION_TRACE_FIXTURE_MODEL}
					className="border-t border-(--session-overview-border)"
					expandedSpeakerLayout="trace-tree"
					items={MASK_COLLAPSED_TRACE_ITEMS}
					userLabel={CONVERSATION_TRACE_FIXTURE_USER_LABEL}
				/>
			</div>
		</section>
	);
}
