import {
	type ProfilerOnRenderCallback,
	useCallback,
	useRef,
	useState,
} from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import {
	buildConversationTraceFixtureTurns,
	CONVERSATION_TRACE_FIXTURE_MODEL,
	CONVERSATION_TRACE_FIXTURE_USER_LABEL,
} from "@/components/conversation/conversation-trace-fixture";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import { createSessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SessionTurnOption } from "./session-turn-option";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

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

type FixtureRenderProfile = {
	maxFullMountDuration: number;
	maxMountDuration: number;
	maxRowsPerUpdateCommit: number;
	maxShellMountDuration: number;
	maxUpdateDuration: number;
	mountDuration: number;
	mounts: number;
	rowMounts: Map<string, number>;
	rowUpdates: Map<string, number>;
	updateCommits: Map<string, Set<string>>;
	updateDuration: number;
	updates: number;
};

function createFixtureRenderProfile(): FixtureRenderProfile {
	return {
		maxFullMountDuration: 0,
		maxMountDuration: 0,
		maxRowsPerUpdateCommit: 0,
		maxShellMountDuration: 0,
		maxUpdateDuration: 0,
		mountDuration: 0,
		mounts: 0,
		rowMounts: new Map(),
		rowUpdates: new Map(),
		updateCommits: new Map(),
		updateDuration: 0,
		updates: 0,
	};
}

// The controller mode complements the pure ConversationTrace fixture. It
// mounts the production continuous-thread viewport synchronizer so expansion
// can be proven not to change active turn state until scrollTop really moves.
export function SessionContinuousTraceFixturePage() {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const hydrationTimerRef = useRef<number | undefined>(undefined);
	const renderProfileRef = useRef(createFixtureRenderProfile());
	const searchParams = new URLSearchParams(window.location.search);
	const streamsTurnBodies = searchParams.get("hydrate") === "manual";
	const profilesScrolling = searchParams.get("profile") === "scroll";
	const usesLongFixture = streamsTurnBodies || profilesScrolling;
	const fixtureOptions = usesLongFixture
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
				: fixtureOptions,
	);
	const [mountsThread, setMountsThread] = useState(false);
	const [viewportStore] = useState(createSessionContinuousTurnViewportStore);
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
	useMountEffect(() => setMountsThread(true));
	useMountEffect(() => {
		viewportStore.publishSelection({ index: 0, speaker: "model" });
		const publishActiveTurn = () => {
			const activeIndex =
				viewportStore.getSnapshot().activeSelection?.index ?? 0;
			if (scrollContainerRef.current) {
				scrollContainerRef.current.dataset.traceFixtureActiveTurn = String(
					activeIndex + 1,
				);
			}
		};
		publishActiveTurn();
		return viewportStore.subscribe(publishActiveTurn);
	});

	const publishRenderProfile = useCallback(() => {
		const element = scrollContainerRef.current;
		if (!element) {
			return;
		}
		const profile = renderProfileRef.current;
		element.dataset.traceFixtureProfileMounts = String(profile.mounts);
		element.dataset.traceFixtureProfileMountDuration = String(
			profile.mountDuration,
		);
		element.dataset.traceFixtureProfileMaxMountDuration = String(
			profile.maxMountDuration,
		);
		element.dataset.traceFixtureProfileMaxFullMountDuration = String(
			profile.maxFullMountDuration,
		);
		element.dataset.traceFixtureProfileMaxShellMountDuration = String(
			profile.maxShellMountDuration,
		);
		element.dataset.traceFixtureProfileMaxRowsPerUpdateCommit = String(
			profile.maxRowsPerUpdateCommit,
		);
		element.dataset.traceFixtureProfileMaxUpdateDuration = String(
			profile.maxUpdateDuration,
		);
		element.dataset.traceFixtureProfileUpdates = String(profile.updates);
		element.dataset.traceFixtureProfileUpdateDuration = String(
			profile.updateDuration,
		);
		element.dataset.traceFixtureProfileRowUpdates = JSON.stringify(
			Object.fromEntries(profile.rowUpdates),
		);
		element.dataset.traceFixtureProfileRowMounts = JSON.stringify(
			Object.fromEntries(profile.rowMounts),
		);
	}, []);

	const handleTurnRender = useCallback<ProfilerOnRenderCallback>(
		(id, phase, actualDuration, _baseDuration, _startTime, commitTime) => {
			const profile = renderProfileRef.current;
			if (phase === "mount") {
				profile.mounts += 1;
				profile.rowMounts.set(id, (profile.rowMounts.get(id) ?? 0) + 1);
				profile.mountDuration += actualDuration;
				profile.maxMountDuration = Math.max(
					profile.maxMountDuration,
					actualDuration,
				);
				if (id.endsWith(":full")) {
					profile.maxFullMountDuration = Math.max(
						profile.maxFullMountDuration,
						actualDuration,
					);
				} else if (id.endsWith(":shell")) {
					profile.maxShellMountDuration = Math.max(
						profile.maxShellMountDuration,
						actualDuration,
					);
				}
			} else if (actualDuration > 0.001) {
				profile.updates += 1;
				profile.updateDuration += actualDuration;
				profile.maxUpdateDuration = Math.max(
					profile.maxUpdateDuration,
					actualDuration,
				);
				profile.rowUpdates.set(id, (profile.rowUpdates.get(id) ?? 0) + 1);
				const commitKey = commitTime.toFixed(3);
				const committedRows =
					profile.updateCommits.get(commitKey) ?? new Set<string>();
				committedRows.add(id);
				profile.updateCommits.set(commitKey, committedRows);
				profile.maxRowsPerUpdateCommit = Math.max(
					profile.maxRowsPerUpdateCommit,
					committedRows.size,
				);
			}
			publishRenderProfile();
		},
		[publishRenderProfile],
	);

	const resetRenderProfile = useCallback(() => {
		renderProfileRef.current = createFixtureRenderProfile();
		publishRenderProfile();
	}, [publishRenderProfile]);

	const handleRetryTurnBody = useCallback(() => {}, []);

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
			data-trace-fixture-active-turn="1"
			data-trace-fixture-continuous-scroller
			data-trace-fixture-hydrated-turns={hydratedTurnCount}
			data-trace-fixture-scroller
			data-trace-fixture-total-turns={fixtureOptions.length}
			className="isolate h-dvh min-w-0 overflow-y-auto bg-(--session-overview-surface) antialiased [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif]"
		>
			{mountsThread ? (
				<SessionContinuousTurnThread
					onRetryTurnBody={profilesScrolling ? handleRetryTurnBody : undefined}
					onTurnRender={profilesScrolling ? handleTurnRender : undefined}
					options={options}
					scrollContainerRef={scrollContainerRef}
					traceCallDisplayMode={traceCallDisplayMode}
					userImageUrl={undefined}
					viewModel={CONTINUOUS_FIXTURE_VIEW_MODEL}
					viewportStore={viewportStore}
				/>
			) : null}
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
			{profilesScrolling ? (
				<button
					className="sr-only"
					data-trace-fixture-reset-profile
					onClick={resetRenderProfile}
					type="button"
				>
					Reset render profile
				</button>
			) : null}
			<div aria-hidden="true" className="h-dvh" />
		</div>
	);
}
