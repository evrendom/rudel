// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: The fixture keeps its controller, profiler, and e2e controls together.
import {
	type ProfilerOnRenderCallback,
	useCallback,
	useMemo,
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
import { createSessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	SessionTranscriptList,
	type SessionTranscriptListHandle,
} from "./session-transcript-list";
import {
	buildSessionTranscriptRowModel,
	createTranscriptSectionCache,
} from "./session-transcript-sections";
import type { SessionTurn } from "./session-turns";
import "./session-constellation-tree.css";

type ContinuousFixtureOption = SessionDetailOverviewTurnOption & {
	turn?: SessionTurn;
};

function countFixtureToolCalls(items: readonly TraceItem[]) {
	return items.reduce(
		(total, item) =>
			item.kind === "agent"
				? total + item.events.filter((event) => event.kind === "tool").length
				: total,
		0,
	);
}

function buildContinuousFixtureOptions(): ContinuousFixtureOption[] {
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
			hasBody: true,
			key: fixtureTurn.key,
			memberPreview: `Fixture prompt for turn ${index + 1}`,
			memberText: `Fixture prompt for turn ${index + 1}`,
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
			turnId: fixtureTurn.key,
			turnNumber: index + 1,
		};
	});
}

const CONTINUOUS_FIXTURE_OPTIONS = buildContinuousFixtureOptions();

const MODEL_HEADER_FIXTURE_HEIGHTS = { member: 56, model: 40 } as const;

function expandModelHeaderFixture(
	options: readonly ContinuousFixtureOption[],
	hasNoResponseTurn = false,
) {
	return options.map((option, optionIndex) => {
		if (!option.turn) {
			return option;
		}
		return {
			...option,
			metrics: {
				...option.metrics,
				usageEvents: option.metrics.usageEvents.map((usage) => ({
					...usage,
					model:
						optionIndex === 0 ? CONVERSATION_TRACE_FIXTURE_MODEL : "gpt-5.2",
				})),
			},
			turn: {
				...option.turn,
				responseItems:
					hasNoResponseTurn && optionIndex === Math.min(1, options.length - 1)
						? []
						: option.turn.responseItems.map((item) =>
								item.kind === "agent"
									? {
											...item,
											events: [
												...item.events,
												...item.events.map((event) => ({
													...event,
													id: `${event.id}:model-header-copy`,
												})),
											],
										}
									: item,
							),
				userItems: option.turn.userItems,
			},
		};
	});
}

function compactStreamingFixtureTurn(turn: SessionTurn | undefined) {
	if (!turn) {
		return undefined;
	}
	return {
		...turn,
		responseItems: turn.responseItems.map((item) =>
			item.kind === "agent"
				? {
						...item,
						events: item.events
							.filter((event) => event.kind === "message")
							.map((event) => {
								const compactText = event.text.split("\n")[0] ?? event.text;
								return {
									...event,
									content: compactText,
									text: compactText,
								};
							}),
					}
				: item,
		),
	};
}

const STREAMED_FIXTURE_OPTIONS: readonly ContinuousFixtureOption[] = Array.from(
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
			turn: compactStreamingFixtureTurn(source.turn),
			turnId: `${source.turnId}:streamed:${index}`,
			turnNumber: index + 1,
		};
	},
);
const FOLD_FIXTURE_OPTIONS: readonly ContinuousFixtureOption[] = Array.from(
	{ length: 12 },
	(_, index) => {
		const source =
			CONTINUOUS_FIXTURE_OPTIONS[index % CONTINUOUS_FIXTURE_OPTIONS.length];
		if (!source) {
			throw new Error("The fold trace fixture requires a source turn");
		}
		return {
			...source,
			key: `${source.key}:fold:${index}`,
			turnId: `${source.turnId}:fold:${index}`,
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
	const virtualListRef = useRef<SessionTranscriptListHandle>(null);
	const hydrationTimerRef = useRef<number | undefined>(undefined);
	const longTaskCountRef = useRef(0);
	const longTaskEpochRef = useRef(0);
	const profilePublishFrameRef = useRef<number | undefined>(undefined);
	const renderProfileRef = useRef<FixtureRenderProfile | null>(null);
	if (renderProfileRef.current === null) {
		renderProfileRef.current = createFixtureRenderProfile();
	}
	const renderProfile = renderProfileRef.current;
	const searchParams = new URLSearchParams(window.location.search);
	const usesConstellationV2 = searchParams.get("constellation") === "v2";
	const modelHeaderFixture = searchParams.get("modelHeader");
	const usesModelHeaderFixture =
		modelHeaderFixture === "split" || modelHeaderFixture === "no-response";
	const streamsTurnBodies = searchParams.get("hydrate") === "manual";
	const profilesScrolling = searchParams.get("profile") === "scroll";
	const usesFoldFixture = searchParams.get("folds") === "1";
	const usesLongFixture =
		streamsTurnBodies || profilesScrolling || usesFoldFixture;
	const requestedTurnCount = Number(searchParams.get("turns"));
	const allFixtureOptions = usesFoldFixture
		? FOLD_FIXTURE_OPTIONS
		: usesLongFixture
			? STREAMED_FIXTURE_OPTIONS
			: CONTINUOUS_FIXTURE_OPTIONS;
	const requestedFixtureOptions =
		Number.isInteger(requestedTurnCount) && requestedTurnCount > 0
			? allFixtureOptions.slice(0, requestedTurnCount)
			: allFixtureOptions;
	const fixtureOptions = usesModelHeaderFixture
		? expandModelHeaderFixture(
				requestedFixtureOptions,
				modelHeaderFixture === "no-response",
			)
		: requestedFixtureOptions;
	const [options, setOptions] = useState<readonly ContinuousFixtureOption[]>(
		() =>
			streamsTurnBodies
				? fixtureOptions.map((option) => {
						const { turn, ...summary } = option;
						void turn;
						return summary;
					})
				: fixtureOptions,
	);
	const [selectedVirtualTurnId, setSelectedVirtualTurnId] = useState(
		() => (usesFoldFixture ? fixtureOptions.at(-1) : fixtureOptions[0])?.turnId,
	);
	const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<string>>(
		() =>
			new Set(
				usesModelHeaderFixture
					? fixtureOptions.map((option) => option.turnId)
					: [],
			),
	);
	const [debugPaintEpoch, setDebugPaintEpoch] = useState(0);
	const [mountsThread, setMountsThread] = useState(false);
	const [viewportStore] = useState(createSessionContinuousTurnViewportStore);
	// ?display=normal mirrors the session detail default (flat request rows)
	// so sticky-geometry tests can cover the shipped hierarchy, not only the
	// nested request layout.
	const [traceCallDisplayMode, setTraceCallDisplayMode] = useState<
		"normal" | "request"
	>(() => (searchParams.get("display") === "normal" ? "normal" : "request"));
	const virtualRenderMode =
		searchParams.get("virtualMode") === "default"
			? ("default" as const)
			: searchParams.get("virtualMode") === "direct-transform"
				? ("direct-transform" as const)
				: ("direct-position" as const);
	const [sectionCache] = useState(createTranscriptSectionCache);
	const virtualTurns = useMemo(
		() =>
			options.map((option) => ({
				body: option.turn,
				option,
				requestUsagePlacement: "start" as const,
			})),
		[options],
	);
	const protectedTurnIds = useMemo(
		() =>
			new Set(
				usesModelHeaderFixture
					? options.map((option) => option.turnId)
					: selectedVirtualTurnId
						? [selectedVirtualTurnId]
						: [],
			),
		[options, selectedVirtualTurnId, usesModelHeaderFixture],
	);
	const virtualModel = useMemo(
		() =>
			buildSessionTranscriptRowModel({
				cache: sectionCache,
				folds: {
					expandedTurnIds,
					protectedTurnIds,
				},
				includeSubagentsAnchor: true,
				level: traceCallDisplayMode,
				revision: "2026-08-02T10:00:00.000Z",
				turns: virtualTurns,
			}),
		[
			expandedTurnIds,
			protectedTurnIds,
			sectionCache,
			traceCallDisplayMode,
			virtualTurns,
		],
	);

	useMountEffect(() => () => {
		if (hydrationTimerRef.current !== undefined) {
			window.clearTimeout(hydrationTimerRef.current);
		}
		if (profilePublishFrameRef.current !== undefined) {
			window.cancelAnimationFrame(profilePublishFrameRef.current);
		}
	});
	useMountEffect(() => setMountsThread(true));
	useMountEffect(() => {
		const element = scrollContainerRef.current;
		if (!profilesScrolling || !element) {
			return;
		}
		element.dataset.traceFixtureLongTasks = "0";
		if (
			typeof PerformanceObserver !== "function" ||
			!PerformanceObserver.supportedEntryTypes.includes("longtask")
		) {
			return;
		}
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (
					entry.duration > 50 &&
					entry.startTime >= longTaskEpochRef.current
				) {
					longTaskCountRef.current += 1;
				}
			}
			element.dataset.traceFixtureLongTasks = String(longTaskCountRef.current);
		});
		observer.observe({ entryTypes: ["longtask"] });
		return () => observer.disconnect();
	});
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
		const profile = renderProfile;
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
	}, [renderProfile]);

	const handleTurnRender = useCallback<ProfilerOnRenderCallback>(
		(id, phase, actualDuration, _baseDuration, _startTime, commitTime) => {
			const profile = renderProfile;
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
			if (profilePublishFrameRef.current === undefined) {
				profilePublishFrameRef.current = window.requestAnimationFrame(() => {
					profilePublishFrameRef.current = undefined;
					publishRenderProfile();
				});
			}
		},
		[publishRenderProfile, renderProfile],
	);

	const resetRenderProfile = useCallback(() => {
		Object.assign(renderProfile, createFixtureRenderProfile());
		longTaskCountRef.current = 0;
		longTaskEpochRef.current = performance.now();
		if (profilePublishFrameRef.current !== undefined) {
			window.cancelAnimationFrame(profilePublishFrameRef.current);
			profilePublishFrameRef.current = undefined;
		}
		if (scrollContainerRef.current) {
			scrollContainerRef.current.dataset.traceFixtureLongTasks = "0";
		}
		publishRenderProfile();
	}, [publishRenderProfile, renderProfile]);

	const expandTurn = useCallback((turnId: string) => {
		setExpandedTurnIds((current) =>
			current.has(turnId) ? current : new Set([...current, turnId]),
		);
	}, []);
	const toggleFold = useCallback((turnId: string) => {
		setExpandedTurnIds((current) => {
			const next = new Set(current);
			if (next.has(turnId)) {
				next.delete(turnId);
			} else {
				next.add(turnId);
			}
			return next;
		});
	}, []);

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

	function prependFixtureTurns() {
		setOptions((current) => {
			const prefix = fixtureOptions.slice(0, 3).map((option, index) => ({
				...option,
				key: `${option.key}:prepended:${index}`,
				turnId: `${option.turnId}:prepended:${index}`,
				turnNumber: index + 1,
			}));
			return [...prefix, ...current];
		});
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
			data-session-constellation-version={usesConstellationV2 ? "v2" : "v1"}
			className={`${usesConstellationV2 ? "session-constellation-tree session-constellation-tree-v2 " : ""}session-transcript-mask isolate h-dvh min-w-0 overflow-y-auto overscroll-contain bg-(--session-overview-surface) antialiased [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] [overflow-anchor:none] [scrollbar-gutter:stable]`}
		>
			{mountsThread ? (
				<SessionTranscriptList
					ref={virtualListRef}
					bodyTurnCount={options.filter((option) => option.turn).length}
					debugEnabled
					debugPaintEpoch={debugPaintEpoch}
					level={traceCallDisplayMode}
					model={virtualModel}
					onExpandTurn={expandTurn}
					onToggleFold={toggleFold}
					onTurnRender={profilesScrolling ? handleTurnRender : undefined}
					pendingCount={options.filter((option) => !option.turn).length}
					renderMode={virtualRenderMode}
					scrollContainerRef={scrollContainerRef}
					selectedTurnId={selectedVirtualTurnId}
					stickyHeaderHeights={
						usesModelHeaderFixture ? MODEL_HEADER_FIXTURE_HEIGHTS : undefined
					}
					userImageUrl={undefined}
					viewModel={CONTINUOUS_FIXTURE_VIEW_MODEL}
					viewportStore={viewportStore}
					windowsLoaded={1}
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
			<output
				className="pointer-events-none fixed top-2 right-2 z-[100] rounded border border-(--session-overview-border) bg-(--session-overview-surface) px-2 py-1 text-[0.6875rem] text-(--session-overview-muted)"
				data-transcript-debug-hud
			/>
			<button
				className="sr-only"
				data-trace-fixture-prepend
				onClick={prependFixtureTurns}
				type="button"
			>
				Prepend turns
			</button>
			<button
				className="sr-only"
				data-trace-fixture-jump-first
				onClick={() => {
					const turnId = options[0]?.turnId;
					if (turnId) {
						setSelectedVirtualTurnId(turnId);
						void virtualListRef.current?.scrollToTurn(turnId, {
							expandFolds: true,
						});
					}
				}}
				type="button"
			>
				Jump to first turn
			</button>
			<button
				className="sr-only"
				data-trace-fixture-jump-last
				onClick={() => {
					const turnId = options.at(-1)?.turnId;
					if (turnId) {
						setSelectedVirtualTurnId(turnId);
						void virtualListRef.current?.scrollToTurn(turnId, {
							expandFolds: true,
						});
					}
				}}
				type="button"
			>
				Jump to last turn
			</button>
			<button
				className="sr-only"
				data-trace-fixture-reset-row-paints
				onClick={() => setDebugPaintEpoch((current) => current + 1)}
				type="button"
			>
				Reset row paint markers
			</button>
			<button
				className="sr-only"
				data-trace-fixture-toggle-level
				onClick={() =>
					setTraceCallDisplayMode((current) =>
						current === "normal" ? "request" : "normal",
					)
				}
				type="button"
			>
				Toggle transcript level
			</button>
		</div>
	);
}
