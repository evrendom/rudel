import { useRef, useState } from "react";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import {
	buildConversationTraceFixtureTurns,
	CONVERSATION_TRACE_FIXTURE_MODEL,
	CONVERSATION_TRACE_FIXTURE_USER_LABEL,
} from "@/components/conversation/conversation-trace-fixture";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SessionTurnOption } from "./session-turn-option";
import type { SessionTurnSelection } from "./session-turn-table-selection";

function countFixtureToolCalls(items: readonly TraceItem[]) {
	return items.reduce(
		(total, item) =>
			item.kind === "agent"
				? total + item.events.filter((event) => event.kind === "tool").length
				: total,
		0,
	);
}

function buildContinuousFixtureOptions(): SessionTurnOption[] {
	return buildConversationTraceFixtureTurns().map((fixtureTurn, index) => {
		const userItems = fixtureTurn.items.filter((item) => item.kind === "user");
		const responseItems = fixtureTurn.items.filter(
			(item) => item.kind !== "user",
		);
		const inputTokens = fixtureTurn.requestUsage.reduce(
			(total, usage) =>
				total +
				usage.inputTokens +
				usage.cacheReadInputTokens +
				usage.cacheCreationInputTokens,
			0,
		);
		const outputTokens = fixtureTurn.requestUsage.reduce(
			(total, usage) => total + usage.outputTokens,
			0,
		);

		return {
			compactionsBefore: [],
			key: fixtureTurn.key,
			memberPreview: `Fixture prompt for turn ${index + 1}`,
			metrics: {
				editedFiles: [],
				errorCount: 0,
				errorEvents: [],
				estimatedCost: 0,
				inputTokens,
				outputTokens,
				skills: [],
				skillEvents: [],
				usageEvents: fixtureTurn.requestUsage,
			},
			preview: `Fixture response for turn ${index + 1}`,
			slashCommands: [],
			timing: {
				durationLabel: "2 min",
				durationSeconds: 120,
				endTime: "10:02",
				endTimestamp: responseItems.at(-1)?.timestamp,
				startTime: "10:00",
				startTimestamp: userItems.at(0)?.timestamp,
			},
			toolCallCount: countFixtureToolCalls(responseItems),
			turn: { responseItems, userItems },
			turnNumber: index + 1,
		};
	});
}

const CONTINUOUS_FIXTURE_OPTIONS = buildContinuousFixtureOptions();
const CONTINUOUS_FIXTURE_VIEW_MODEL = buildSessionDetailViewModel(
	{
		content: "",
		model_used: CONVERSATION_TRACE_FIXTURE_MODEL,
		session_date: "2026-08-02T10:00:00.000Z",
		session_id: "trace-tree-fixture",
		user_id: "trace-tree-fixture-user",
	},
	{
		"trace-tree-fixture-user": CONVERSATION_TRACE_FIXTURE_USER_LABEL,
	},
);

// The controller mode complements the pure ConversationTrace fixture. It
// mounts the production continuous-thread viewport synchronizer so expansion
// can be proven not to change active turn state until scrollTop really moves.
export function SessionContinuousTraceFixturePage() {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [selection, setSelection] = useState<SessionTurnSelection>({
		index: 0,
		speaker: "model",
	});
	// ?display=normal mirrors the session detail default (flat request rows)
	// so sticky-geometry tests can cover the shipped hierarchy, not only the
	// nested request layout.
	const traceCallDisplayMode =
		new URLSearchParams(window.location.search).get("display") === "normal"
			? "normal"
			: "request";

	return (
		<div
			ref={scrollContainerRef}
			data-conversation-trace-scroll-container
			data-trace-fixture-active-turn={selection.index + 1}
			data-trace-fixture-continuous-scroller
			data-trace-fixture-scroller
			className="isolate h-dvh min-w-0 overflow-y-auto bg-(--session-overview-surface) antialiased [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif]"
		>
			<SessionContinuousTurnThread
				onActiveIndexChange={(index) =>
					setSelection((currentSelection) => ({
						...currentSelection,
						index,
					}))
				}
				onViewportChange={() => {}}
				options={CONTINUOUS_FIXTURE_OPTIONS}
				scrollContainerRef={scrollContainerRef}
				selection={selection}
				traceCallDisplayMode={traceCallDisplayMode}
				userImageUrl={undefined}
				viewModel={CONTINUOUS_FIXTURE_VIEW_MODEL}
			/>
			<div aria-hidden="true" className="h-dvh" />
		</div>
	);
}
