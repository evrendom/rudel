import { useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import {
	buildConversationTraceFixtureTurns,
	CONVERSATION_TRACE_FIXTURE_MODEL,
	CONVERSATION_TRACE_FIXTURE_USER_LABEL,
} from "@/components/conversation/conversation-trace-fixture";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SessionTurnOption } from "./session-turn-option";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
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
const STREAMED_FIXTURE_OPTIONS: readonly SessionTurnOption[] = Array.from(
	{ length: 18 },
	(_, index) => {
		const source =
			CONTINUOUS_FIXTURE_OPTIONS[index % CONTINUOUS_FIXTURE_OPTIONS.length];
		if (!source) {
			throw new Error("The streamed trace fixture requires a source turn");
		}
		return {
			...source,
			key: `${source.key}:streamed:${index}`,
			turnNumber: index + 1,
		};
	},
);
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
	const hydrationTimerRef = useRef<number | undefined>(undefined);
	const searchParams = new URLSearchParams(window.location.search);
	const streamsTurnBodies = searchParams.get("hydrate") === "manual";
	const fixtureOptions = streamsTurnBodies
		? STREAMED_FIXTURE_OPTIONS
		: CONTINUOUS_FIXTURE_OPTIONS;
	const [options, setOptions] = useState<readonly SessionTurnTablePaneOption[]>(
		() =>
			streamsTurnBodies
				? fixtureOptions.map((option) => {
						const { turn, ...summary } = option;
						void turn;
						return summary;
					})
				: CONTINUOUS_FIXTURE_OPTIONS,
	);
	const [selection, setSelection] = useState<SessionTurnSelection>({
		index: 0,
		speaker: "model",
	});
	// ?display=normal mirrors the session detail default (flat request rows)
	// so sticky-geometry tests can cover the shipped hierarchy, not only the
	// nested request layout.
	const traceCallDisplayMode =
		searchParams.get("display") === "normal" ? "normal" : "request";

	useMountEffect(() => () => {
		if (hydrationTimerRef.current !== undefined) {
			window.clearTimeout(hydrationTimerRef.current);
		}
	});

	function hydrateTurnBodies() {
		let nextIndex = 0;
		const hydrateNext = () => {
			const indexToHydrate = nextIndex;
			setOptions((current) =>
				current.map((option, index) =>
					index === indexToHydrate ? (fixtureOptions[index] ?? option) : option,
				),
			);
			nextIndex += 1;
			if (nextIndex < fixtureOptions.length) {
				hydrationTimerRef.current = window.setTimeout(hydrateNext, 80);
			}
		};
		hydrateNext();
	}

	const hydratedTurnCount = options.filter((option) => option.turn).length;

	return (
		<div
			ref={scrollContainerRef}
			data-conversation-trace-scroll-container
			data-trace-fixture-active-turn={selection.index + 1}
			data-trace-fixture-continuous-scroller
			data-trace-fixture-hydrated-turns={hydratedTurnCount}
			data-trace-fixture-scroller
			data-trace-fixture-total-turns={fixtureOptions.length}
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
				options={options}
				scrollContainerRef={scrollContainerRef}
				selection={selection}
				traceCallDisplayMode={traceCallDisplayMode}
				userImageUrl={undefined}
				viewModel={CONTINUOUS_FIXTURE_VIEW_MODEL}
			/>
			{streamsTurnBodies ? (
				<button
					className="sr-only"
					data-trace-fixture-hydrate
					onClick={hydrateTurnBodies}
					type="button"
				>
					Hydrate turn bodies
				</button>
			) : null}
			<div aria-hidden="true" className="h-dvh" />
		</div>
	);
}
