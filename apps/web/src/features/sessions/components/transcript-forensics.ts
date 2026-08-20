// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: The forensic controller keeps one clock and one ring-buffer schema so frame correlations cannot drift across modules.
const TRACE_FRAME_LIMIT = 7_200;
const TRACE_EVENT_LIMIT = 10_000;
const ANCHOR_JOURNAL_LIMIT = 200;
const ANCHOR_JOURNAL_STALL_THRESHOLD_MS = 250;
const ACTIVE_INPUT_WINDOW_MS = 32;
const FLAGGED_FRAME_MS = 32;
const HEARTBEAT_BLIND_WINDOW_MS = 48;

export type TranscriptProgrammaticWriteCause =
	| "prepend-anchor"
	| "resize-adjustment"
	| "turn-anchor"
	| "virtualizer";

export type TranscriptAnchorDeactivationClause =
	| "epoch-superseded"
	| "mode-free-scrolling"
	| "turn-mismatch";

export type TranscriptAnchorJournalInput =
	| {
			speaker: "member" | "model";
			turnId: string;
			turnIndex: number;
			type: "select";
	  }
	| {
			requestId: number;
			turnId: string;
			type: "anchorRequest";
	  }
	| {
			requestId: number;
			source: "click-pair" | "url-fallback";
			turnId: string;
			type: "anchorDerive";
	  }
	| {
			epoch: number;
			estimatedStart: number | undefined;
			rowIndex: number;
			scrollTop: number | undefined;
			turnId: string;
			type: "scrollToTurn:start";
	  }
	| {
			turnFirstRowIndexSize: number;
			turnId: string;
			type: "scrollToTurn:missing-index";
	  }
	| {
			delta: number;
			epoch: number;
			phase: "hard" | "soft";
			target: number;
			type: "pin:write";
	  }
	| {
			elapsedMs: number;
			epoch: number;
			settled: boolean;
			starvedMs: number;
			type: "pin:settle";
			via: "stable-frames" | "timeout";
	  }
	| {
			clause: TranscriptAnchorDeactivationClause;
			epoch: number;
			type: "pin:deactivate";
	  }
	| {
			epoch: number;
			eventType: string;
			key: string | undefined;
			modeAtCancel: "anchoring-turn" | "soft-anchored";
			type: "cancelAnchor";
	  }
	| {
			outcome:
				| "ran"
				| "skipped-handled"
				| "skipped-no-model"
				| "stale-pair-blocked"
				| "used-stored-promise";
			pairTurnId: string | undefined;
			requestId: number;
			storedPromiseResult: boolean | undefined;
			turnId: string;
			type: "retryEffect";
	  }
	| {
			elapsedMs: number;
			phase: "fetch-done" | "fetch-error" | "fetch-start";
			turnId: string;
			type: "anchorWindow";
	  }
	| {
			attribution: string;
			durationMs: number;
			type: "mainThreadStall";
	  };

export type TranscriptAnchorJournalEntry = TranscriptAnchorJournalInput & {
	at: number;
};

export type TranscriptForensicsContentFlags = {
	charCount: number;
	eventCount: number;
	hasCodeBlock: boolean;
};

export type TranscriptForensicsFeelScore = {
	blankMs: number;
	inputLatencyMs: number | null;
	lumpCount: number;
	maskedGapMs: number;
	maxWheelQueueingDelayMs: number | null;
	maxFrameGapMs: number;
	momentumKills: number;
	p95WheelQueueingDelayMs: number | null;
	reversalCount: number;
	trueBlankMs: number;
};

export type TranscriptForensicsProgrammaticWrite = {
	at: number;
	cause: TranscriptProgrammaticWriteCause;
	delta: number;
	est: number | undefined;
	measured: number | undefined;
	rowId: string | undefined;
	target: number;
};

export type TranscriptForensicsAdjustment = {
	at: number;
	delta: number;
	est: number;
	measured: number;
	rowId: string;
};

export type TranscriptForensicsFrame = {
	anatomy: TranscriptForensicsFrameAnatomy;
	at: number;
	blankPts: number;
	blankRowIds: readonly (string | null)[];
	blankSamples: readonly boolean[];
	frameMs: number;
	longTaskMs: number;
	mounted: readonly string[];
	maskedGapPts: number;
	maskedGapSamples: readonly boolean[];
	moved: number;
	phase: "coast" | "idle" | "input";
	progWrites: readonly TranscriptForensicsProgrammaticWrite[];
	scrollTop: number;
	suspectMarks: readonly string[];
	trueBlankPts: number;
	trueBlankSamples: readonly boolean[];
	unmounted: readonly string[];
	userDelta: number;
	wheelEventCount: number;
	worstWheelQueueingDelayMs: number | null;
};

export type TranscriptForensicsLongAnimationScript = {
	duration: number;
	forcedStyleAndLayoutDuration: number;
	functionName: string;
	invoker: string;
	sourceURL: string;
};

export type TranscriptForensicsLongAnimationFrame = {
	blockingDuration: number;
	duration: number;
	forcedReflowCount: number;
	renderStart: number;
	scripts: readonly TranscriptForensicsLongAnimationScript[];
	startTime: number;
	styleAndLayoutDuration: number;
};

export type TranscriptForensicsRowPaint = {
	contentVersion: string;
	mountedAt: number | null;
	paintLagMs: number | null;
	paintedAt: number | null;
	rowId: string;
};

export type TranscriptForensicsResource = {
	duration: number;
	kind: "font" | "image" | "window";
	responseEnd: number;
	startTime: number;
	url: string;
};

export type TranscriptForensicsReactCommitReason =
	| "body-attached"
	| "fold-or-row-data"
	| "level-change"
	| "mount"
	| "no-data-change"
	| "selection";

export type TranscriptForensicsReactCommit = {
	actualDuration: number;
	at: number;
	phase: "mount" | "nested-update" | "update";
	reason: TranscriptForensicsReactCommitReason;
	rowId: string;
};

export type TranscriptForensicsViewportRow = {
	contentVersion: string;
	rowId: string;
};

export type TranscriptForensicsBlindWindow = {
	durationMs: number;
	endedAt: number;
	entryScrollTop: number;
	exitScrollTop: number;
	maskVisible: boolean;
	startedAt: number;
	viewportRows: readonly TranscriptForensicsViewportRow[];
};

export type TranscriptForensicsBlankEpisode = {
	durationMs: number;
	endedAt: number;
	loafAttribution: readonly TranscriptForensicsLongAnimationFrame[];
	presentation: "masked-gap" | "true-blank";
	rowIds: readonly string[];
	scrollDelta: number;
	startedAt: number;
};

export type TranscriptForensicsFrameResource = TranscriptForensicsResource & {
	elapsed: number;
};

export type TranscriptForensicsFrameAnatomy = {
	attributed: boolean;
	blindWindows: readonly TranscriptForensicsBlindWindow[];
	flags: readonly string[];
	input: {
		wheelEventCount: number;
		worstQueueingDelayMs: number | null;
	};
	layout: {
		duration: number;
		forcedReflowCount: number;
	};
	network: readonly TranscriptForensicsFrameResource[];
	paint: {
		blankPts: number;
		blankRowIds: readonly (string | null)[];
		maskedGapPts: number;
		paintedRows: readonly TranscriptForensicsRowPaint[];
		trueBlankPts: number;
		unpaintedVisibleRowIds: readonly string[];
	};
	react: {
		commitCount: number;
		committedRowIds: readonly string[];
		commits: readonly TranscriptForensicsReactCommit[];
		mountedRowIds: readonly string[];
	};
	scripts: {
		longAnimationFrames: readonly TranscriptForensicsLongAnimationFrame[];
		suspectMarks: readonly string[];
	};
	topCause: string | null;
};

export type TranscriptForensicsFlaggedFrame = {
	anatomy: TranscriptForensicsFrameAnatomy;
	at: number;
	frameIndex: number;
	frameMs: number;
};

export type TranscriptForensicsWheelEventTiming = {
	duration: number;
	processingStart: number;
	queueingDelay: number;
	source: "event-timing" | "wheel-timestamp";
	startTime: number;
};

export type TranscriptForensicsMount = TranscriptForensicsContentFlags & {
	actualDuration: number;
	at: number;
	commitLatency: number;
	duration: number;
	rowId: string;
	rowKind: string;
};

export type TranscriptForensicsMeasure = {
	at: number;
	delta: number;
	est: number;
	measured: number;
	rowId: string;
};

export type TranscriptForensicsSuspectMeasure = {
	detail: Readonly<Record<string, string | number | boolean>> | undefined;
	duration: number;
	name: string;
	startTime: number;
};

export type TranscriptForensicsLifecycle = {
	at: number;
	component: "list" | "pane";
	instanceId: string;
	phase: "mount" | "unmount";
	propsFingerprint: string;
	reason:
		| "initial-mount"
		| "props-changed-after-parent-unmount-or-key-change"
		| "same-props-parent-remount-or-key-change"
		| "unmount";
};

export type TranscriptForensicsRun = {
	endedAt: number;
	expectedDirection: -1 | 1;
	feelScore: TranscriptForensicsFeelScore;
	firstInputAt: number | null;
	frameCount: number;
	inputEventCount: number;
	label: string;
	startedAt: number;
};

export type TranscriptForensicsMountAggregate = {
	count: number;
	key: string;
	maxDuration: number;
	meanDuration: number;
	totalDuration: number;
};

export type TranscriptForensicsDump = {
	adjustments: readonly TranscriptForensicsAdjustment[];
	blankEpisodes: readonly TranscriptForensicsBlankEpisode[];
	blindWindows: readonly TranscriptForensicsBlindWindow[];
	createdAt: string;
	feelScore: TranscriptForensicsFeelScore;
	flaggedFrames: readonly TranscriptForensicsFlaggedFrame[];
	frames: readonly TranscriptForensicsFrame[];
	lifecycles: readonly TranscriptForensicsLifecycle[];
	measurements: readonly TranscriptForensicsMeasure[];
	mountAggregates: {
		byContentFlags: readonly TranscriptForensicsMountAggregate[];
		byKind: readonly TranscriptForensicsMountAggregate[];
	};
	mounts: readonly TranscriptForensicsMount[];
	longAnimationFrames: readonly TranscriptForensicsLongAnimationFrame[];
	reactCommits: readonly TranscriptForensicsReactCommit[];
	resources: readonly TranscriptForensicsResource[];
	rowPaints: readonly TranscriptForensicsRowPaint[];
	runs: readonly TranscriptForensicsRun[];
	suspectMeasures: readonly TranscriptForensicsSuspectMeasure[];
	wheelEventTimings: readonly TranscriptForensicsWheelEventTiming[];
	version: 1;
};

export type TranscriptForensicsController = {
	beginRun: (label: string, expectedDirection?: -1 | 1) => void;
	blockMainThread: (durationMs: number) => void;
	dump: () => TranscriptForensicsDump;
	endRun: () => TranscriptForensicsRun;
	recordSyntaxHighlight: (input: {
		actualDuration: number;
		charCount: number;
		commitTime: number;
		language: string;
		phase: "mount" | "nested-update" | "update";
		startTime: number;
	}) => void;
	reset: () => void;
};

declare global {
	interface Window {
		__transcriptAnchorJournal?: readonly TranscriptAnchorJournalEntry[];
		__transcriptTrace?: TranscriptForensicsController;
	}
}

type ActiveRun = {
	expectedDirection: -1 | 1;
	firstInputAt: number | null;
	inputEventCount: number;
	label: string;
	lastInputAt: number | null;
	startedAt: number;
};

type LongTaskRecord = {
	duration: number;
	startTime: number;
};

type TranscriptForensicsElementPaint = {
	contentVersion: string;
	paintedAt: number;
	rowId: string;
};

type TranscriptForensicsRowLifecycle = TranscriptForensicsViewportRow & {
	at: number;
	phase: "mount" | "unmount";
};

type HeartbeatWitness = {
	at: number;
	maskVisible: boolean;
	scrollTop: number;
	viewportRows: readonly TranscriptForensicsViewportRow[];
};

type TranscriptForensicsViewportGeometry = {
	clientHeight: number;
	rows: readonly (TranscriptForensicsViewportRow & {
		end: number;
		start: number;
	})[];
	scrollTop: number;
};

type RuntimeState = {
	activeRun: ActiveRun | undefined;
	adjustments: TranscriptForensicsAdjustment[];
	anchorJournal: TranscriptAnchorJournalEntry[];
	attachmentVersion: number;
	blindWindows: TranscriptForensicsBlindWindow[];
	controller: TranscriptForensicsController;
	elementPaints: TranscriptForensicsElementPaint[];
	elementTimingObserver: PerformanceObserver | undefined;
	eventTimingObserver: PerformanceObserver | undefined;
	frameHandle: number | undefined;
	frames: TranscriptForensicsFrame[];
	heartbeatEntryWitnesses: Map<number, HeartbeatWitness | undefined>;
	heartbeatWorker: Worker | undefined;
	lastAnchorSelectAt: number | undefined;
	lastFrameAt: number;
	lastHeartbeatWitness: HeartbeatWitness | undefined;
	lastScrollTop: number;
	lifecycles: TranscriptForensicsLifecycle[];
	longAnimationFrameObserver: PerformanceObserver | undefined;
	longAnimationFrames: TranscriptForensicsLongAnimationFrame[];
	longTasks: LongTaskRecord[];
	measurements: TranscriptForensicsMeasure[];
	mounts: TranscriptForensicsMount[];
	longTaskObserver: PerformanceObserver | undefined;
	measureObserver: PerformanceObserver | undefined;
	observedScrollTop: number;
	pendingMounted: string[];
	pendingUnmounted: string[];
	pendingUserDelta: number;
	pendingWrites: TranscriptForensicsProgrammaticWrite[];
	paintedContentVersions: Map<string, string>;
	reactCommits: TranscriptForensicsReactCommit[];
	reportedAnchorFailureEpochs: Set<number>;
	resourceObserver: PerformanceObserver | undefined;
	resources: TranscriptForensicsResource[];
	rowLifecycles: TranscriptForensicsRowLifecycle[];
	runs: TranscriptForensicsRun[];
	scrollElement: HTMLElement | undefined;
	scrollListener: ((event: Event) => void) | undefined;
	suspectMeasures: TranscriptForensicsSuspectMeasure[];
	viewportGeometry: TranscriptForensicsViewportGeometry | undefined;
	wheelEventTimings: TranscriptForensicsWheelEventTiming[];
	wheelListener: ((event: WheelEvent) => void) | undefined;
};

let runtime: RuntimeState | undefined;
let traceInstanceSequence = 0;
let measureSequence = 0;
const previousUnmounts = new Map<
	"list" | "pane",
	{ at: number; propsFingerprint: string }
>();

export function ensureTranscriptTrace(enabled: boolean) {
	if (!(enabled && typeof window !== "undefined")) {
		return undefined;
	}
	if (!runtime) {
		runtime = createRuntime();
		window.__transcriptAnchorJournal = runtime.anchorJournal;
		window.__transcriptTrace = runtime.controller;
	}
	return runtime.controller;
}

export function createTranscriptTraceInstanceId(component: "list" | "pane") {
	traceInstanceSequence += 1;
	return `${component}-${traceInstanceSequence}`;
}

export function attachTranscriptTraceScroller(element: HTMLElement) {
	const trace = runtime;
	if (!trace) {
		return () => undefined;
	}
	trace.attachmentVersion += 1;
	const attachmentVersion = trace.attachmentVersion;
	detachRuntimeScroller(trace);
	trace.scrollElement = element;
	trace.lastFrameAt = performance.now();
	trace.lastScrollTop = element.scrollTop;
	trace.observedScrollTop = element.scrollTop;
	trace.scrollListener = (event) => {
		if (event.currentTarget instanceof HTMLElement) {
			trace.observedScrollTop = event.currentTarget.scrollTop;
		}
	};
	element.addEventListener("scroll", trace.scrollListener, { passive: true });
	trace.wheelListener = (event) => {
		const processingStart = performance.now();
		const eventAt =
			event.timeStamp >= 0 && event.timeStamp <= processingStart + 1_000
				? event.timeStamp
				: processingStart;
		trace.pendingUserDelta += event.deltaY;
		if (trace.activeRun) {
			trace.activeRun.firstInputAt ??= eventAt;
			trace.activeRun.lastInputAt = eventAt;
			trace.activeRun.inputEventCount += 1;
			if (event.deltaY !== 0) {
				trace.activeRun.expectedDirection = event.deltaY > 0 ? 1 : -1;
			}
		}
		pushBounded(
			trace.wheelEventTimings,
			{
				duration: Math.max(0, performance.now() - processingStart),
				processingStart,
				queueingDelay: Math.max(0, processingStart - eventAt),
				source: "wheel-timestamp",
				startTime: eventAt,
			},
			TRACE_EVENT_LIMIT,
		);
	};
	element.addEventListener("wheel", trace.wheelListener, { passive: true });
	startFrameLoop(trace);
	return () => {
		if (runtime?.attachmentVersion === attachmentVersion) {
			detachRuntimeScroller(trace);
		}
	};
}

export function recordTranscriptProgrammaticWrite(
	write: TranscriptForensicsProgrammaticWrite,
) {
	if (!runtime) {
		return;
	}
	pushBounded(runtime.pendingWrites, write, TRACE_EVENT_LIMIT);
}

export function recordAnchorJournal(event: TranscriptAnchorJournalInput) {
	if (!runtime) {
		return;
	}
	const entry: TranscriptAnchorJournalEntry = {
		...event,
		at: performance.now(),
	};
	pushBounded(runtime.anchorJournal, entry, ANCHOR_JOURNAL_LIMIT);
	if (entry.type === "select") {
		runtime.lastAnchorSelectAt = entry.at;
	}
	const elapsedMs = Math.round(entry.at - (runtime.lastAnchorSelectAt ?? 0));
	console.log(`[anchor +${elapsedMs}ms] ${formatAnchorJournalEntry(entry)}`);
}

function formatAnchorJournalEntry(entry: TranscriptAnchorJournalEntry): string {
	switch (entry.type) {
		case "select":
			return `ledger click → turn ${entry.turnIndex} (${entry.speaker}) ${entry.turnId}`;
		case "anchorRequest":
			return `anchor request #${entry.requestId} → ${entry.turnId}`;
		case "anchorDerive":
			return `anchorTurnId=${entry.turnId} via ${entry.source} (request #${entry.requestId})`;
		case "scrollToTurn:start":
			return `scrollToTurn ${entry.turnId} epoch=${entry.epoch} rowIndex=${entry.rowIndex} estStart=${formatAnchorJournalNumber(entry.estimatedStart)} scrollTop=${formatAnchorJournalNumber(entry.scrollTop)}`;
		case "scrollToTurn:missing-index":
			return `scrollToTurn ${entry.turnId} FAILED: not in row model (turnFirstRowIndex size=${entry.turnFirstRowIndexSize})`;
		case "pin:write":
			return `pin write [${entry.phase}] epoch=${entry.epoch} target=${formatAnchorJournalNumber(entry.target)} delta=${formatAnchorJournalNumber(entry.delta)}`;
		case "pin:settle":
			return `pin settled=${entry.settled} via=${entry.via} epoch=${entry.epoch} after ${formatAnchorJournalNumber(entry.elapsedMs)}ms starved=${formatAnchorJournalNumber(entry.starvedMs)}ms`;
		case "pin:deactivate":
			return `pin DEACTIVATED epoch=${entry.epoch} clause=${entry.clause}`;
		case "cancelAnchor": {
			const key = entry.key === undefined ? "" : ` key=${entry.key}`;
			return `cancelAnchor via ${entry.eventType}${key} while ${entry.modeAtCancel} epoch=${entry.epoch}`;
		}
		case "retryEffect": {
			const pairTurn =
				entry.pairTurnId === undefined ? "" : ` pairTurn=${entry.pairTurnId}`;
			const storedPromise =
				entry.storedPromiseResult === undefined
					? ""
					: ` storedPromise=${entry.storedPromiseResult}`;
			return `retry effect turn=${entry.turnId}${pairTurn} requestId=${entry.requestId} outcome=${entry.outcome}${storedPromise}`;
		}
		case "anchorWindow":
			return `anchor window ${entry.phase} turn=${entry.turnId} +${formatAnchorJournalNumber(entry.elapsedMs)}ms`;
		case "mainThreadStall":
			return `MAIN THREAD STALL ${formatAnchorJournalNumber(entry.durationMs)}ms — ${entry.attribution}`;
	}
}

function formatAnchorJournalNumber(value: number | undefined) {
	return value === undefined
		? "undefined"
		: String(Math.round(value * 10) / 10);
}

export function reportAnchorJournalFailure(epoch: number | undefined) {
	if (!runtime) {
		return;
	}
	if (epoch !== undefined) {
		if (runtime.reportedAnchorFailureEpochs.has(epoch)) {
			return;
		}
		runtime.reportedAnchorFailureEpochs.add(epoch);
	}
	console.table(getAnchorJournalSlice(runtime.anchorJournal, epoch));
}

export function recordTranscriptAdjustment(
	adjustment: TranscriptForensicsAdjustment,
) {
	if (!runtime) {
		return;
	}
	pushBounded(runtime.adjustments, adjustment, TRACE_EVENT_LIMIT);
}

export function recordTranscriptMeasurement(
	measurement: TranscriptForensicsMeasure,
) {
	if (!runtime) {
		return;
	}
	pushBounded(runtime.measurements, measurement, TRACE_EVENT_LIMIT);
}

export function recordTranscriptRowLifecycle(
	rowId: string,
	contentVersion: string,
	phase: "mount" | "unmount",
) {
	if (!runtime) {
		return;
	}
	pushBounded(
		runtime.rowLifecycles,
		{ at: performance.now(), contentVersion, phase, rowId },
		TRACE_EVENT_LIMIT,
	);
	const target =
		phase === "mount" ? runtime.pendingMounted : runtime.pendingUnmounted;
	pushBounded(target, rowId, TRACE_EVENT_LIMIT);
	if (phase === "mount" && runtime.viewportGeometry) {
		runtime.viewportGeometry = {
			...runtime.viewportGeometry,
			rows: runtime.viewportGeometry.rows.map((row) =>
				row.rowId === rowId ? { ...row, contentVersion } : row,
			),
		};
	}
}

export function recordTranscriptViewportGeometry(
	geometry: TranscriptForensicsViewportGeometry,
) {
	if (!runtime) {
		return;
	}
	runtime.viewportGeometry = {
		...geometry,
		rows: geometry.rows.map((row) => ({ ...row })),
	};
}

export function recordTranscriptReactCommit(
	commit: TranscriptForensicsReactCommit,
) {
	if (!runtime) {
		return;
	}
	pushBounded(runtime.reactCommits, commit, TRACE_EVENT_LIMIT);
}

export function recordTranscriptComponentLifecycle(input: {
	component: "list" | "pane";
	instanceId: string;
	phase: "mount" | "unmount";
	propsFingerprint: string;
}) {
	if (!runtime) {
		return;
	}
	const at = performance.now();
	let reason: TranscriptForensicsLifecycle["reason"] = "unmount";
	if (input.phase === "unmount") {
		previousUnmounts.set(input.component, {
			at,
			propsFingerprint: input.propsFingerprint,
		});
	} else {
		const previous = previousUnmounts.get(input.component);
		reason = previous
			? previous.propsFingerprint === input.propsFingerprint
				? "same-props-parent-remount-or-key-change"
				: "props-changed-after-parent-unmount-or-key-change"
			: "initial-mount";
	}
	pushBounded(
		runtime.lifecycles,
		{
			at,
			component: input.component,
			instanceId: input.instanceId,
			phase: input.phase,
			propsFingerprint: input.propsFingerprint,
			reason,
		},
		TRACE_EVENT_LIMIT,
	);
}

export function recordTranscriptRowMount(input: {
	actualDuration: number;
	commitTime: number;
	flags: TranscriptForensicsContentFlags;
	rowId: string;
	rowKind: string;
	startTime: number;
}) {
	if (!runtime || runtime.mounts.some((mount) => mount.rowId === input.rowId)) {
		return;
	}
	const commitLatency = Math.max(0, input.commitTime - input.startTime);
	const duration = Math.max(input.actualDuration, commitLatency);
	recordMeasuredInterval(
		`row-mount:${input.rowKind}`,
		input.startTime,
		duration,
		{
			charCount: input.flags.charCount,
			eventCount: input.flags.eventCount,
			hasCodeBlock: input.flags.hasCodeBlock,
			rowId: input.rowId,
		},
		false,
	);
	pushBounded(
		runtime.mounts,
		{
			...input.flags,
			actualDuration: input.actualDuration,
			at: performance.now(),
			commitLatency,
			duration,
			rowId: input.rowId,
			rowKind: input.rowKind,
		},
		TRACE_EVENT_LIMIT,
	);
}

export function recordTranscriptSyntaxHighlight(input: {
	actualDuration: number;
	charCount: number;
	commitTime: number;
	language: string;
	phase: "mount" | "nested-update" | "update";
	startTime: number;
}) {
	if (!runtime) {
		return;
	}
	recordMeasuredInterval(
		"syntax-highlight",
		input.startTime,
		input.actualDuration,
		{
			charCount: input.charCount,
			language: input.language,
			phase: input.phase,
		},
		true,
	);
}

export function measureTranscriptSuspect<TValue>(
	name: string,
	detail: Readonly<Record<string, string | number | boolean>> | undefined,
	operation: () => TValue,
) {
	if (!runtime) {
		return operation();
	}
	const startTime = performance.now();
	const sequence = measureSequence;
	measureSequence += 1;
	const startMark = `transcript:suspect:${name}:start:${sequence}`;
	const endMark = `transcript:suspect:${name}:end:${sequence}`;
	performance.mark(startMark);
	try {
		return operation();
	} finally {
		performance.mark(endMark);
		const duration = performance.now() - startTime;
		performance.measure(`transcript:suspect:${name}`, startMark, endMark);
		performance.clearMarks(startMark);
		performance.clearMarks(endMark);
		pushBounded(
			runtime.suspectMeasures,
			{ detail, duration, name, startTime },
			TRACE_EVENT_LIMIT,
		);
	}
}

function createRuntime(): RuntimeState {
	let trace: RuntimeState;
	const controller: TranscriptForensicsController = {
		beginRun: (label, expectedDirection = 1) => {
			if (trace.activeRun) {
				throw new Error("A transcript forensic run is already active");
			}
			trace.activeRun = {
				expectedDirection,
				firstInputAt: null,
				inputEventCount: 0,
				label,
				lastInputAt: null,
				startedAt: performance.now(),
			};
		},
		blockMainThread: (durationMs) => {
			const endAt = performance.now() + Math.max(0, durationMs);
			while (performance.now() < endAt) {
				// This debug-only hook validates the worker witness against a known
				// main-thread blind window.
			}
		},
		dump: () => buildDump(trace),
		endRun: () => endActiveRun(trace),
		recordSyntaxHighlight: (input) => recordTranscriptSyntaxHighlight(input),
		reset: () => resetRuntime(trace),
	};
	trace = {
		activeRun: undefined,
		adjustments: [],
		anchorJournal: [],
		attachmentVersion: 0,
		blindWindows: [],
		controller,
		elementPaints: [],
		elementTimingObserver: undefined,
		eventTimingObserver: undefined,
		frameHandle: undefined,
		frames: [],
		heartbeatEntryWitnesses: new Map(),
		heartbeatWorker: undefined,
		lastAnchorSelectAt: undefined,
		lastFrameAt: performance.now(),
		lastHeartbeatWitness: undefined,
		lastScrollTop: 0,
		lifecycles: [],
		longAnimationFrameObserver: undefined,
		longAnimationFrames: [],
		longTasks: [],
		measurements: [],
		measureObserver: undefined,
		mounts: [],
		longTaskObserver: undefined,
		observedScrollTop: 0,
		pendingMounted: [],
		pendingUnmounted: [],
		pendingUserDelta: 0,
		pendingWrites: [],
		paintedContentVersions: new Map(),
		reactCommits: [],
		reportedAnchorFailureEpochs: new Set(),
		resourceObserver: undefined,
		resources: [],
		rowLifecycles: [],
		runs: [],
		scrollElement: undefined,
		scrollListener: undefined,
		suspectMeasures: [],
		viewportGeometry: undefined,
		wheelEventTimings: [],
		wheelListener: undefined,
	};
	installSuspectMeasureObserver(trace);
	if (
		typeof PerformanceObserver === "function" &&
		PerformanceObserver.supportedEntryTypes.includes("longtask")
	) {
		trace.longTaskObserver = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				pushBounded(
					trace.longTasks,
					{ duration: entry.duration, startTime: entry.startTime },
					TRACE_EVENT_LIMIT,
				);
				if (entry.duration > ANCHOR_JOURNAL_STALL_THRESHOLD_MS) {
					recordAnchorJournal({
						attribution: getMainThreadStallAttribution(
							entry.startTime,
							entry.duration,
							entry.name,
						),
						durationMs: entry.duration,
						type: "mainThreadStall",
					});
				}
			}
		});
		trace.longTaskObserver.observe({ entryTypes: ["longtask"] });
	}
	if (
		typeof PerformanceObserver === "function" &&
		PerformanceObserver.supportedEntryTypes.includes("event")
	) {
		trace.eventTimingObserver = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (
					entry.name !== "wheel" ||
					!("processingStart" in entry) ||
					typeof entry.processingStart !== "number"
				) {
					continue;
				}
				const fallbackIndex = trace.wheelEventTimings.findIndex(
					(event) =>
						event.source === "wheel-timestamp" &&
						Math.abs(event.startTime - entry.startTime) < 1,
				);
				if (fallbackIndex >= 0) {
					trace.wheelEventTimings.splice(fallbackIndex, 1);
				}
				pushBounded(
					trace.wheelEventTimings,
					{
						duration: entry.duration,
						processingStart: entry.processingStart,
						queueingDelay: Math.max(0, entry.processingStart - entry.startTime),
						source: "event-timing",
						startTime: entry.startTime,
					},
					TRACE_EVENT_LIMIT,
				);
			}
		});
		const eventObserverOptions: PerformanceObserverInit & {
			durationThreshold: number;
		} = { durationThreshold: 16, type: "event" };
		trace.eventTimingObserver.observe(eventObserverOptions);
	}
	installLongAnimationFrameObserver(trace);
	installElementTimingObserver(trace);
	installResourceObserver(trace);
	installHeartbeatWorker(trace);
	return trace;
}

function installSuspectMeasureObserver(trace: RuntimeState) {
	if (
		typeof PerformanceObserver !== "function" ||
		!PerformanceObserver.supportedEntryTypes.includes("measure")
	) {
		return;
	}
	trace.measureObserver = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			const name = getRenderSuspectMeasureName(entry.name);
			if (!name) {
				continue;
			}
			pushBounded(
				trace.suspectMeasures,
				{
					detail: undefined,
					duration: entry.duration,
					name,
					startTime: entry.startTime,
				},
				TRACE_EVENT_LIMIT,
			);
		}
	});
	trace.measureObserver.observe({ entryTypes: ["measure"] });
}

function installLongAnimationFrameObserver(trace: RuntimeState) {
	if (
		typeof PerformanceObserver !== "function" ||
		!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")
	) {
		return;
	}
	trace.longAnimationFrameObserver = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			const scripts =
				"scripts" in entry && Array.isArray(entry.scripts)
					? entry.scripts.flatMap((script) => {
							if (typeof script !== "object" || script === null) {
								return [];
							}
							const forcedStyleAndLayoutDuration =
								"forcedStyleAndLayoutDuration" in script &&
								typeof script.forcedStyleAndLayoutDuration === "number"
									? script.forcedStyleAndLayoutDuration
									: 0;
							const functionName =
								"sourceFunctionName" in script &&
								typeof script.sourceFunctionName === "string"
									? script.sourceFunctionName
									: "";
							return [
								{
									duration:
										"duration" in script && typeof script.duration === "number"
											? script.duration
											: 0,
									forcedStyleAndLayoutDuration,
									functionName,
									invoker:
										"invoker" in script && typeof script.invoker === "string"
											? script.invoker
											: "",
									sourceURL:
										"sourceURL" in script &&
										typeof script.sourceURL === "string"
											? script.sourceURL
											: "",
								},
							];
						})
					: [];
			const renderStart =
				"renderStart" in entry && typeof entry.renderStart === "number"
					? entry.renderStart
					: 0;
			const styleAndLayoutStart =
				"styleAndLayoutStart" in entry &&
				typeof entry.styleAndLayoutStart === "number"
					? entry.styleAndLayoutStart
					: 0;
			const longAnimationFrame: TranscriptForensicsLongAnimationFrame = {
				blockingDuration:
					"blockingDuration" in entry &&
					typeof entry.blockingDuration === "number"
						? entry.blockingDuration
						: Math.max(0, entry.duration - 50),
				duration: entry.duration,
				forcedReflowCount: scripts.filter(
					(script) => script.forcedStyleAndLayoutDuration > 0,
				).length,
				renderStart,
				scripts,
				startTime: entry.startTime,
				styleAndLayoutDuration:
					styleAndLayoutStart > 0
						? Math.max(
								0,
								entry.startTime + entry.duration - styleAndLayoutStart,
							)
						: 0,
			};
			pushBounded(
				trace.longAnimationFrames,
				longAnimationFrame,
				TRACE_EVENT_LIMIT,
			);
			if (entry.duration > ANCHOR_JOURNAL_STALL_THRESHOLD_MS) {
				recordAnchorJournal({
					attribution: getLongAnimationFrameAttribution(longAnimationFrame),
					durationMs: entry.duration,
					type: "mainThreadStall",
				});
			}
		}
	});
	trace.longAnimationFrameObserver.observe({
		buffered: true,
		type: "long-animation-frame",
	});
}

function getLongAnimationFrameAttribution(
	entry: TranscriptForensicsLongAnimationFrame,
) {
	const script = entry.scripts.reduce<
		TranscriptForensicsLongAnimationScript | undefined
	>(
		(longest, candidate) =>
			!longest || candidate.duration > longest.duration ? candidate : longest,
		undefined,
	);
	const scriptAttribution = script
		? [script.sourceURL, script.functionName].filter(Boolean).join(" ") ||
			script.invoker ||
			"long-animation-frame"
		: "long-animation-frame";
	return getMainThreadStallAttribution(
		entry.startTime,
		entry.duration,
		scriptAttribution,
	);
}

function getMainThreadStallAttribution(
	startTime: number,
	duration: number,
	fallback: string,
) {
	const namedMeasure = performance
		.getEntriesByType("measure")
		.flatMap((entry) => {
			const name = getStallSuspectMeasureName(entry.name);
			return name &&
				intervalsOverlap(
					startTime,
					startTime + duration,
					entry.startTime,
					entry.startTime + entry.duration,
				)
				? [{ duration: entry.duration, name }]
				: [];
		})
		.sort((left, right) => left.duration - right.duration)[0]?.name;
	return namedMeasure ? `${namedMeasure} — ${fallback}` : fallback;
}

function getRenderSuspectMeasureName(name: string) {
	if (name === "transcript:model-build") {
		return "model-build";
	}
	if (name === "transcript:body-normalize") {
		return "body-normalize";
	}
	return undefined;
}

function getStallSuspectMeasureName(name: string) {
	const renderMeasure = getRenderSuspectMeasureName(name);
	if (renderMeasure) {
		return renderMeasure;
	}
	const suspectPrefix = "transcript:suspect:";
	return name.startsWith(suspectPrefix)
		? name.slice(suspectPrefix.length)
		: undefined;
}

function installElementTimingObserver(trace: RuntimeState) {
	if (
		typeof PerformanceObserver !== "function" ||
		!PerformanceObserver.supportedEntryTypes.includes("element")
	) {
		return;
	}
	trace.elementTimingObserver = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			if (!("element" in entry) || !(entry.element instanceof HTMLElement)) {
				continue;
			}
			const row = entry.element.closest<HTMLElement>("[data-row-id]");
			const rowId = row?.dataset.rowId;
			const contentVersion = row?.dataset.transcriptContentVersion;
			if (!(rowId && contentVersion)) {
				continue;
			}
			const renderTime =
				"renderTime" in entry && typeof entry.renderTime === "number"
					? entry.renderTime
					: 0;
			const loadTime =
				"loadTime" in entry && typeof entry.loadTime === "number"
					? entry.loadTime
					: 0;
			const paintedAt = Math.max(entry.startTime, renderTime, loadTime);
			if (
				!trace.elementPaints.some(
					(paint) =>
						paint.rowId === rowId && paint.contentVersion === contentVersion,
				)
			) {
				pushBounded(
					trace.elementPaints,
					{ contentVersion, paintedAt, rowId },
					TRACE_EVENT_LIMIT,
				);
			}
			trace.paintedContentVersions.set(rowId, contentVersion);
		}
	});
	trace.elementTimingObserver.observe({ buffered: true, type: "element" });
}

function installResourceObserver(trace: RuntimeState) {
	if (
		typeof PerformanceObserver !== "function" ||
		!PerformanceObserver.supportedEntryTypes.includes("resource")
	) {
		return;
	}
	trace.resourceObserver = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			const initiatorType =
				"initiatorType" in entry && typeof entry.initiatorType === "string"
					? entry.initiatorType
					: "";
			const kind = classifyTranscriptResource(entry.name, initiatorType);
			if (!kind) {
				continue;
			}
			const responseEnd =
				"responseEnd" in entry && typeof entry.responseEnd === "number"
					? entry.responseEnd
					: entry.startTime + entry.duration;
			pushBounded(
				trace.resources,
				{
					duration: entry.duration,
					kind,
					responseEnd,
					startTime: entry.startTime,
					url: entry.name,
				},
				TRACE_EVENT_LIMIT,
			);
		}
	});
	trace.resourceObserver.observe({ buffered: true, type: "resource" });
}

function classifyTranscriptResource(
	url: string,
	initiatorType: string,
): TranscriptForensicsResource["kind"] | undefined {
	if (url.includes("/rpc/analytics/sessions/detailWindow")) {
		return "window";
	}
	if (
		initiatorType === "img" ||
		/\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?|$)/iu.test(url)
	) {
		return "image";
	}
	if (/\.(?:otf|ttf|woff2?)(?:\?|$)/iu.test(url)) {
		return "font";
	}
	return undefined;
}

function installHeartbeatWorker(trace: RuntimeState) {
	if (typeof Worker !== "function") {
		return;
	}
	const source = `
		let sequence = 0;
		let waiting;
		self.onmessage = (event) => {
			if (!waiting || event.data?.type !== "echo" || event.data.sequence !== waiting.sequence) return;
			const durationMs = performance.now() - waiting.startedAt;
			self.postMessage({
				type: "result",
				sequence: waiting.sequence,
				durationMs,
				startedWallTime: waiting.startedWallTime,
				endedWallTime: Date.now(),
			});
			waiting = undefined;
		};
		setInterval(() => {
			if (waiting) return;
			sequence += 1;
			waiting = {
				sequence,
				startedAt: performance.now(),
				startedWallTime: Date.now(),
			};
			self.postMessage({ type: "ping", sequence });
		}, 16);
	`;
	const workerUrl = URL.createObjectURL(
		new Blob([source], { type: "text/javascript" }),
	);
	const worker = new Worker(workerUrl);
	URL.revokeObjectURL(workerUrl);
	trace.heartbeatWorker = worker;
	worker.addEventListener("message", (event: MessageEvent<unknown>) => {
		const message = event.data;
		if (
			typeof message !== "object" ||
			message === null ||
			!("type" in message)
		) {
			return;
		}
		if (
			message.type === "ping" &&
			"sequence" in message &&
			typeof message.sequence === "number"
		) {
			trace.heartbeatEntryWitnesses.set(
				message.sequence,
				trace.lastHeartbeatWitness,
			);
			worker.postMessage({ type: "echo", sequence: message.sequence });
			const element = trace.scrollElement;
			if (element) {
				trace.lastHeartbeatWitness = {
					at: performance.now(),
					maskVisible: isTranscriptTextureMaskVisible(element),
					scrollTop: trace.lastScrollTop,
					viewportRows: getVisibleTranscriptRows(trace, trace.lastScrollTop),
				};
			}
			return;
		}
		if (
			message.type !== "result" ||
			!("sequence" in message) ||
			typeof message.sequence !== "number" ||
			!("durationMs" in message) ||
			typeof message.durationMs !== "number" ||
			!("startedWallTime" in message) ||
			typeof message.startedWallTime !== "number" ||
			!("endedWallTime" in message) ||
			typeof message.endedWallTime !== "number"
		) {
			return;
		}
		const entryWitness = trace.heartbeatEntryWitnesses.get(message.sequence);
		trace.heartbeatEntryWitnesses.delete(message.sequence);
		const element = trace.scrollElement;
		if (
			!(
				element &&
				entryWitness &&
				message.durationMs >= HEARTBEAT_BLIND_WINDOW_MS
			)
		) {
			return;
		}
		const startedAt = message.startedWallTime - performance.timeOrigin;
		const endedAt = message.endedWallTime - performance.timeOrigin;
		const blindWindow: TranscriptForensicsBlindWindow = {
			durationMs: message.durationMs,
			endedAt,
			entryScrollTop: entryWitness.scrollTop,
			exitScrollTop: trace.lastScrollTop,
			maskVisible: entryWitness.maskVisible,
			startedAt,
			viewportRows: mergeViewportRows(
				entryWitness.viewportRows,
				getVisibleTranscriptRows(trace, trace.lastScrollTop),
			),
		};
		pushBounded(trace.blindWindows, blindWindow, TRACE_EVENT_LIMIT);
		window.requestAnimationFrame(() => {
			const currentElement = trace.scrollElement;
			if (!currentElement) {
				return;
			}
			const index = trace.blindWindows.indexOf(blindWindow);
			if (index < 0) {
				return;
			}
			trace.blindWindows[index] = {
				...blindWindow,
				exitScrollTop: trace.lastScrollTop,
				viewportRows: mergeViewportRows(
					blindWindow.viewportRows,
					getVisibleTranscriptRows(trace, trace.lastScrollTop),
				),
			};
		});
	});
}

function getVisibleTranscriptRows(trace: RuntimeState, scrollTop: number) {
	const geometry = trace.viewportGeometry;
	if (!geometry) {
		return [];
	}
	const viewportBottom = scrollTop + geometry.clientHeight;
	return geometry.rows
		.filter((row) => row.end > scrollTop && row.start < viewportBottom)
		.map(({ contentVersion, rowId }) => ({ contentVersion, rowId }));
}

function getMountedTranscriptRows(element: HTMLElement) {
	return Array.from(
		element.querySelectorAll<HTMLElement>(
			"[data-row-id][data-transcript-content-version]",
		),
	).flatMap<TranscriptForensicsViewportRow>((row) => {
		const rowId = row.dataset.rowId;
		const contentVersion = row.dataset.transcriptContentVersion;
		return rowId && contentVersion ? [{ contentVersion, rowId }] : [];
	});
}

function mergeViewportRows(
	left: readonly TranscriptForensicsViewportRow[],
	right: readonly TranscriptForensicsViewportRow[],
) {
	const rows = new Map<string, TranscriptForensicsViewportRow>();
	for (const row of [...left, ...right]) {
		rows.set(`${row.rowId}\u0000${row.contentVersion}`, row);
	}
	return [...rows.values()];
}

function startFrameLoop(trace: RuntimeState) {
	const tick = (at: number) => {
		trace.frameHandle = undefined;
		const element = trace.scrollElement;
		if (!element) {
			return;
		}
		const previousFrameAt = trace.lastFrameAt;
		const scrollTop = trace.observedScrollTop;
		const moved = scrollTop - trace.lastScrollTop;
		const userDelta = trace.pendingUserDelta;
		const progWrites = trace.pendingWrites.splice(0);
		const mounted = trace.pendingMounted.splice(0);
		const unmounted = trace.pendingUnmounted.splice(0);
		trace.pendingUserDelta = 0;
		const longTaskMs = trace.longTasks.reduce(
			(total, task) =>
				total +
				overlapDuration(previousFrameAt, at, task.startTime, task.duration),
			0,
		);
		const suspectMarks = [
			...new Set(
				trace.suspectMeasures
					.filter(
						(measure) =>
							measure.startTime < at &&
							measure.startTime + measure.duration > previousFrameAt,
					)
					.map((measure) => measure.name),
			),
		];
		const lastInputAt = trace.activeRun?.lastInputAt;
		const phase = trace.activeRun
			? lastInputAt !== null &&
				lastInputAt !== undefined &&
				at - lastInputAt <= ACTIVE_INPUT_WINDOW_MS
				? "input"
				: trace.activeRun.firstInputAt !== null
					? "coast"
					: "idle"
			: "idle";
		const frame: TranscriptForensicsFrame = {
			anatomy: emptyFrameAnatomy(),
			at,
			blankPts: 0,
			blankRowIds: [null, null, null, null, null],
			blankSamples: [false, false, false, false, false],
			frameMs: at - previousFrameAt,
			longTaskMs,
			mounted,
			maskedGapPts: 0,
			maskedGapSamples: [false, false, false, false, false],
			moved,
			phase,
			progWrites,
			scrollTop,
			suspectMarks,
			trueBlankPts: 0,
			trueBlankSamples: [false, false, false, false, false],
			unmounted,
			userDelta,
			wheelEventCount: 0,
			worstWheelQueueingDelayMs: null,
		};
		pushBounded(trace.frames, frame, TRACE_FRAME_LIMIT);
		window.setTimeout(() => {
			if (trace.scrollElement !== element) {
				return;
			}
			const frameIndex = trace.frames.indexOf(frame);
			if (frameIndex < 0) {
				return;
			}
			const { blankRowIds, blankSamples, maskedGapSamples, trueBlankSamples } =
				sampleBlankPoints(trace, frame.scrollTop);
			trace.frames[frameIndex] = {
				...frame,
				blankPts: blankSamples.filter(Boolean).length,
				blankRowIds,
				blankSamples,
				maskedGapPts: maskedGapSamples.filter(Boolean).length,
				maskedGapSamples,
				trueBlankPts: trueBlankSamples.filter(Boolean).length,
				trueBlankSamples,
			};
		}, 0);
		trace.lastFrameAt = at;
		trace.lastScrollTop = scrollTop;
		trace.frameHandle = window.requestAnimationFrame(tick);
	};
	trace.frameHandle = window.requestAnimationFrame(tick);
}

function detachRuntimeScroller(trace: RuntimeState) {
	if (trace.scrollElement && trace.wheelListener) {
		trace.scrollElement.removeEventListener("wheel", trace.wheelListener);
	}
	if (trace.scrollElement && trace.scrollListener) {
		trace.scrollElement.removeEventListener("scroll", trace.scrollListener);
	}
	if (trace.frameHandle !== undefined) {
		window.cancelAnimationFrame(trace.frameHandle);
	}
	trace.frameHandle = undefined;
	trace.scrollElement = undefined;
	trace.scrollListener = undefined;
	trace.wheelListener = undefined;
}

function endActiveRun(trace: RuntimeState) {
	const activeRun = trace.activeRun;
	if (!activeRun) {
		throw new Error("No transcript forensic run is active");
	}
	const endedAt = performance.now();
	const frames = trace.frames.filter(
		(frame) => frame.at >= activeRun.startedAt && frame.at <= endedAt,
	);
	const rowPaints = buildRowPaints(trace);
	const blankEpisodes = buildBlankEpisodes(trace, rowPaints).filter(
		(episode) =>
			episode.startedAt <= endedAt && episode.endedAt >= activeRun.startedAt,
	);
	const run: TranscriptForensicsRun = {
		endedAt,
		expectedDirection: activeRun.expectedDirection,
		feelScore: computeFeelScore(
			frames,
			activeRun,
			trace.wheelEventTimings.filter(
				(event) =>
					event.startTime >= activeRun.startedAt && event.startTime <= endedAt,
			),
			blankEpisodes,
		),
		firstInputAt: activeRun.firstInputAt,
		frameCount: frames.length,
		inputEventCount: activeRun.inputEventCount,
		label: activeRun.label,
		startedAt: activeRun.startedAt,
	};
	pushBounded(trace.runs, run, TRACE_EVENT_LIMIT);
	trace.activeRun = undefined;
	return run;
}

function getCurrentFeelScore(trace: RuntimeState) {
	const activeRun = trace.activeRun;
	if (!activeRun) {
		return trace.runs.at(-1)?.feelScore ?? emptyFeelScore();
	}
	return computeFeelScore(
		trace.frames.filter((frame) => frame.at >= activeRun.startedAt),
		activeRun,
		trace.wheelEventTimings.filter(
			(event) => event.startTime >= activeRun.startedAt,
		),
		buildBlankEpisodes(trace, buildRowPaints(trace)).filter(
			(episode) => episode.endedAt >= activeRun.startedAt,
		),
	);
}

function computeFeelScore(
	frames: readonly TranscriptForensicsFrame[],
	run: ActiveRun,
	wheelEventTimings: readonly TranscriptForensicsWheelEventTiming[],
	blankEpisodes: readonly TranscriptForensicsBlankEpisode[],
): TranscriptForensicsFeelScore {
	const firstInputAt = run.firstInputAt;
	const scoredFrames =
		firstInputAt === null
			? frames
			: frames.filter((frame) => frame.at >= firstInputAt - 20);
	const firstMotion = scoredFrames.find(
		(frame) => Math.abs(frame.moved) >= 0.5,
	);
	const inputLatencyMs =
		run.firstInputAt === null || !firstMotion
			? null
			: Math.max(0, firstMotion.at - run.firstInputAt);
	let maxFrameGapMs = 0;
	let zeroMotionStartedAt: number | undefined;
	let lumpCount = 0;
	let reversalCount = 0;
	let previousVelocity = 0;
	let momentumKills = 0;
	const queueingDelays = wheelEventTimings.map((event) => event.queueingDelay);
	const blankEpisodeDurations = blankEpisodes.map((episode) => ({
		duration: overlapDuration(
			run.startedAt,
			performance.now(),
			episode.startedAt,
			episode.durationMs,
		),
		presentation: episode.presentation,
	}));
	const trailingInputs: number[] = [];
	const writes = scoredFrames.flatMap((frame) => frame.progWrites);
	for (const frame of scoredFrames) {
		const movement = Math.abs(frame.moved);
		if (frame.phase === "input") {
			maxFrameGapMs = Math.max(maxFrameGapMs, frame.frameMs);
		}
		if (frame.phase === "input" && movement < 0.5) {
			zeroMotionStartedAt ??= frame.at - frame.frameMs;
			maxFrameGapMs = Math.max(maxFrameGapMs, frame.at - zeroMotionStartedAt);
		} else if (movement >= 0.5) {
			zeroMotionStartedAt = undefined;
		}
		const trailingAverage = average(trailingInputs);
		if (trailingAverage > 0 && movement > trailingAverage * 3) {
			lumpCount += 1;
		}
		if (frame.userDelta !== 0) {
			trailingInputs.push(Math.abs(frame.userDelta));
			if (trailingInputs.length > 5) {
				trailingInputs.shift();
			}
		}
		if (movement >= 0.5 && Math.sign(frame.moved) !== run.expectedDirection) {
			reversalCount += 1;
		}
		const velocity = frame.frameMs > 0 ? movement / frame.frameMs : 0;
		if (
			frame.phase === "coast" &&
			previousVelocity > 0.01 &&
			velocity < previousVelocity * 0.2 &&
			writes.some(
				(write) =>
					Math.abs(write.delta) >= 0.5 && Math.abs(write.at - frame.at) <= 32,
			)
		) {
			momentumKills += 1;
		}
		if (frame.phase !== "idle") {
			previousVelocity = velocity;
		}
	}
	return {
		blankMs: blankEpisodeDurations.reduce(
			(total, episode) => total + episode.duration,
			0,
		),
		inputLatencyMs,
		lumpCount,
		maskedGapMs: blankEpisodeDurations.reduce(
			(total, episode) =>
				total + (episode.presentation === "masked-gap" ? episode.duration : 0),
			0,
		),
		maxWheelQueueingDelayMs:
			queueingDelays.length > 0 ? Math.max(...queueingDelays) : null,
		maxFrameGapMs,
		momentumKills,
		p95WheelQueueingDelayMs: percentile(queueingDelays, 0.95),
		reversalCount,
		trueBlankMs: blankEpisodeDurations.reduce(
			(total, episode) =>
				total + (episode.presentation === "true-blank" ? episode.duration : 0),
			0,
		),
	};
}

function sampleBlankPoints(trace: RuntimeState, scrollTop: number) {
	const geometry = trace.viewportGeometry;
	const maskVisible = isTranscriptTextureMaskVisible(trace.scrollElement);
	const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((ratio) => {
		const offset = scrollTop + (geometry?.clientHeight ?? 0) * ratio;
		const row = geometry?.rows.find(
			(candidate) => candidate.start <= offset && candidate.end > offset,
		);
		const rowId = row?.rowId ?? null;
		const contentVersion = row?.contentVersion;
		const painted =
			rowId !== null &&
			contentVersion !== undefined &&
			trace.paintedContentVersions.get(rowId) === contentVersion;
		return { blank: !painted, rowId };
	});
	return {
		blankRowIds: samples.map((sample) => (sample.blank ? sample.rowId : null)),
		blankSamples: samples.map((sample) => sample.blank),
		maskedGapSamples: samples.map((sample) => sample.blank && maskVisible),
		trueBlankSamples: samples.map((sample) => sample.blank && !maskVisible),
	};
}

function isTranscriptTextureMaskVisible(element: HTMLElement | undefined) {
	if (!element?.classList.contains("session-transcript-mask")) {
		return false;
	}
	const style = window.getComputedStyle(element);
	return (
		style.backgroundImage !== "none" &&
		style.backgroundAttachment
			.split(",")
			.some((attachment) => attachment.trim() === "local")
	);
}

function buildDump(trace: RuntimeState): TranscriptForensicsDump {
	const rowPaints = buildRowPaints(trace);
	const blankEpisodes = buildBlankEpisodes(trace, rowPaints);
	const frames = correlateFrameAnatomy(trace, rowPaints);
	const flaggedFrames = frames.flatMap<TranscriptForensicsFlaggedFrame>(
		(frame, frameIndex) =>
			frame.anatomy.flags.length > 0
				? [
						{
							anatomy: frame.anatomy,
							at: frame.at,
							frameIndex,
							frameMs: frame.frameMs,
						},
					]
				: [],
	);
	return {
		adjustments: [...trace.adjustments],
		blankEpisodes,
		blindWindows: [...trace.blindWindows],
		createdAt: new Date().toISOString(),
		feelScore: getCurrentFeelScore(trace),
		flaggedFrames,
		frames,
		lifecycles: [...trace.lifecycles],
		measurements: [...trace.measurements],
		mountAggregates: {
			byContentFlags: aggregateMounts(trace.mounts, (mount) =>
				[
					mount.rowKind,
					`code=${mount.hasCodeBlock}`,
					`events=${mount.eventCount}`,
					`chars=${mount.charCount}`,
				].join("|"),
			),
			byKind: aggregateMounts(trace.mounts, (mount) => mount.rowKind),
		},
		mounts: [...trace.mounts],
		longAnimationFrames: [...trace.longAnimationFrames],
		reactCommits: [...trace.reactCommits],
		resources: [...trace.resources],
		rowPaints,
		runs: [...trace.runs],
		suspectMeasures: [...trace.suspectMeasures],
		wheelEventTimings: [...trace.wheelEventTimings],
		version: 1,
	};
}

function resetRuntime(trace: RuntimeState) {
	const resetAt = performance.now();
	const mountedRows = trace.scrollElement
		? getMountedTranscriptRows(trace.scrollElement)
		: [];
	const paintedRows = mountedRows.filter(
		(row) => trace.paintedContentVersions.get(row.rowId) === row.contentVersion,
	);
	trace.activeRun = undefined;
	trace.adjustments.length = 0;
	trace.anchorJournal.length = 0;
	trace.blindWindows.length = 0;
	trace.elementPaints.length = 0;
	trace.frames.length = 0;
	trace.heartbeatEntryWitnesses.clear();
	trace.lastAnchorSelectAt = undefined;
	trace.lastFrameAt = resetAt;
	trace.lastScrollTop = trace.observedScrollTop;
	trace.longTasks.length = 0;
	trace.longAnimationFrames.length = 0;
	trace.measurements.length = 0;
	trace.mounts.length = 0;
	trace.pendingMounted.length = 0;
	trace.pendingUnmounted.length = 0;
	trace.pendingUserDelta = 0;
	trace.pendingWrites.length = 0;
	trace.reactCommits.length = 0;
	trace.reportedAnchorFailureEpochs.clear();
	trace.resources.length = 0;
	trace.rowLifecycles.length = 0;
	trace.runs.length = 0;
	trace.suspectMeasures.length = 0;
	trace.wheelEventTimings.length = 0;
	for (const row of mountedRows) {
		trace.rowLifecycles.push({ ...row, at: resetAt, phase: "mount" });
	}
	for (const row of paintedRows) {
		trace.elementPaints.push({ ...row, paintedAt: resetAt });
	}
}

function correlateFrameAnatomy(
	trace: RuntimeState,
	rowPaints: readonly TranscriptForensicsRowPaint[],
) {
	return trace.frames.map((frame) => {
		const frameStart = frame.at - frame.frameMs;
		const overlappingEvents = trace.wheelEventTimings.filter(
			(event) =>
				event.startTime <= frame.at && event.processingStart >= frameStart,
		);
		const longAnimationFrames = trace.longAnimationFrames.filter((entry) =>
			intervalsOverlap(
				frameStart,
				frame.at,
				entry.startTime,
				entry.startTime + entry.duration,
			),
		);
		const commits = trace.reactCommits.filter(
			(commit) => commit.at > frameStart && commit.at <= frame.at,
		);
		const commitCount = new Set(commits.map((commit) => commit.at.toFixed(3)))
			.size;
		const resources = trace.resources.flatMap<TranscriptForensicsFrameResource>(
			(resource) =>
				intervalsOverlap(
					frameStart,
					frame.at,
					resource.startTime,
					resource.responseEnd,
				)
					? [
							{
								...resource,
								elapsed: Math.max(
									0,
									Math.min(frame.at, resource.responseEnd) - resource.startTime,
								),
							},
						]
					: [],
		);
		const paintedRows = rowPaints.filter(
			(paint) =>
				paint.paintedAt !== null &&
				paint.paintedAt > frameStart &&
				paint.paintedAt <= frame.at,
		);
		const blindWindows = trace.blindWindows.filter((window) =>
			intervalsOverlap(frameStart, frame.at, window.startedAt, window.endedAt),
		);
		const unpaintedVisibleRowIds = [
			...new Set(frame.blankRowIds.filter((rowId) => rowId !== null)),
		];
		const worstQueueingDelay =
			overlappingEvents.length > 0
				? Math.max(...overlappingEvents.map((event) => event.queueingDelay))
				: null;
		const layoutDuration = longAnimationFrames.reduce(
			(total, entry) => total + entry.styleAndLayoutDuration,
			0,
		);
		const forcedReflowCount = longAnimationFrames.reduce(
			(total, entry) => total + entry.forcedReflowCount,
			0,
		);
		const flags = [
			frame.frameMs > FLAGGED_FRAME_MS ? "frame-gap" : undefined,
			worstQueueingDelay !== null && worstQueueingDelay >= 8
				? "queued-input"
				: undefined,
			frame.maskedGapPts > 0 ? "masked-gap-pixels" : undefined,
			frame.trueBlankPts > 0 ? "true-blank-pixels" : undefined,
			blindWindows.length > 0 ? "heartbeat-blind-window" : undefined,
		].filter((flag) => flag !== undefined);
		const cause = pickFrameTopCause({
			blindWindows,
			commits,
			frame,
			layoutDuration,
			longAnimationFrames,
			paintedRows,
			resources,
			trace,
			unpaintedVisibleRowIds,
			worstQueueingDelay,
		});
		const anatomy: TranscriptForensicsFrameAnatomy = {
			attributed: cause !== null,
			blindWindows,
			flags,
			input: {
				wheelEventCount: overlappingEvents.length,
				worstQueueingDelayMs: worstQueueingDelay,
			},
			layout: { duration: layoutDuration, forcedReflowCount },
			network: resources,
			paint: {
				blankPts: frame.blankPts,
				blankRowIds: frame.blankRowIds,
				maskedGapPts: frame.maskedGapPts,
				paintedRows,
				trueBlankPts: frame.trueBlankPts,
				unpaintedVisibleRowIds,
			},
			react: {
				commitCount,
				committedRowIds: [...new Set(commits.map((commit) => commit.rowId))],
				commits,
				mountedRowIds: frame.mounted,
			},
			scripts: { longAnimationFrames, suspectMarks: frame.suspectMarks },
			topCause: cause,
		};
		return {
			...frame,
			anatomy,
			wheelEventCount: overlappingEvents.length,
			worstWheelQueueingDelayMs: worstQueueingDelay,
		};
	});
}

function buildRowPaints(trace: RuntimeState) {
	const mounts = new Map<string, TranscriptForensicsRowLifecycle>();
	for (const lifecycle of trace.rowLifecycles) {
		const key = `${lifecycle.rowId}\u0000${lifecycle.contentVersion}`;
		if (lifecycle.phase === "mount") {
			mounts.set(key, lifecycle);
		}
	}
	const keys = new Set([
		...mounts.keys(),
		...trace.elementPaints.map(
			(paint) => `${paint.rowId}\u0000${paint.contentVersion}`,
		),
	]);
	return [...keys].map<TranscriptForensicsRowPaint>((key) => {
		const separator = key.indexOf("\u0000");
		const rowId = key.slice(0, separator);
		const contentVersion = key.slice(separator + 1);
		const mount = mounts.get(key);
		const paint = trace.elementPaints.find(
			(candidate) =>
				candidate.rowId === rowId &&
				candidate.contentVersion === contentVersion,
		);
		return {
			contentVersion,
			mountedAt: mount?.at ?? null,
			paintLagMs:
				mount && paint ? Math.max(0, paint.paintedAt - mount.at) : null,
			paintedAt: paint?.paintedAt ?? null,
			rowId,
		};
	});
}

function buildBlankEpisodes(
	trace: RuntimeState,
	rowPaints: readonly TranscriptForensicsRowPaint[],
) {
	return trace.blindWindows.flatMap<TranscriptForensicsBlankEpisode>(
		(blindWindow) => {
			const rowIds = [
				...new Set(
					blindWindow.viewportRows.flatMap((row) => {
						const paint = rowPaints.find(
							(candidate) =>
								candidate.rowId === row.rowId &&
								candidate.contentVersion === row.contentVersion,
						);
						return paint?.paintedAt !== null &&
							paint?.paintedAt !== undefined &&
							paint.paintedAt > blindWindow.endedAt
							? [row.rowId]
							: [];
					}),
				),
			];
			if (rowIds.length === 0) {
				return [];
			}
			return [
				{
					durationMs: blindWindow.durationMs,
					endedAt: blindWindow.endedAt,
					loafAttribution: trace.longAnimationFrames.filter((entry) =>
						intervalsOverlap(
							blindWindow.startedAt,
							blindWindow.endedAt,
							entry.startTime,
							entry.startTime + entry.duration,
						),
					),
					presentation: blindWindow.maskVisible ? "masked-gap" : "true-blank",
					rowIds,
					scrollDelta: blindWindow.exitScrollTop - blindWindow.entryScrollTop,
					startedAt: blindWindow.startedAt,
				},
			];
		},
	);
}

function pickFrameTopCause(input: {
	blindWindows: readonly TranscriptForensicsBlindWindow[];
	commits: readonly TranscriptForensicsReactCommit[];
	frame: TranscriptForensicsFrame;
	layoutDuration: number;
	longAnimationFrames: readonly TranscriptForensicsLongAnimationFrame[];
	paintedRows: readonly TranscriptForensicsRowPaint[];
	resources: readonly TranscriptForensicsFrameResource[];
	trace: RuntimeState;
	unpaintedVisibleRowIds: readonly string[];
	worstQueueingDelay: number | null;
}) {
	const frameStart = input.frame.at - input.frame.frameMs;
	const suspects = input.trace.suspectMeasures.filter((measure) =>
		intervalsOverlap(
			frameStart,
			input.frame.at,
			measure.startTime,
			measure.startTime + measure.duration,
		),
	);
	const scripts = input.longAnimationFrames.flatMap((entry) => entry.scripts);
	const candidates: { duration: number; label: string }[] = [];
	for (const script of scripts) {
		candidates.push({
			duration: script.duration,
			label: `script ${script.functionName || script.sourceURL || "anonymous"} ${script.duration.toFixed(1)}ms`,
		});
	}
	for (const suspect of suspects) {
		candidates.push({
			duration: suspect.duration,
			label: `${suspect.name} ${suspect.duration.toFixed(1)}ms`,
		});
	}
	if (input.layoutDuration > 0) {
		candidates.push({
			duration: input.layoutDuration,
			label: `style/layout ${input.layoutDuration.toFixed(1)}ms`,
		});
	}
	const reactDuration = input.commits.reduce(
		(total, commit) => total + commit.actualDuration,
		0,
	);
	if (input.commits.length > 0) {
		candidates.push({
			duration: reactDuration,
			label: `React ${String(new Set(input.commits.map((commit) => commit.at.toFixed(3))).size)} commits ${reactDuration.toFixed(1)}ms`,
		});
	}
	if (input.worstQueueingDelay !== null) {
		candidates.push({
			duration: input.worstQueueingDelay,
			label: `wheel queued ${input.worstQueueingDelay.toFixed(1)}ms`,
		});
	}
	if (input.frame.longTaskMs > 0) {
		candidates.push({
			duration: input.frame.longTaskMs,
			label: `long task ${input.frame.longTaskMs.toFixed(1)}ms`,
		});
	}
	for (const blindWindow of input.blindWindows) {
		candidates.push({
			duration: blindWindow.durationMs,
			label: `heartbeat blind ${blindWindow.durationMs.toFixed(1)}ms`,
		});
	}
	if (input.unpaintedVisibleRowIds.length > 0) {
		candidates.push({
			duration: input.frame.frameMs,
			label: `unpainted rows ${input.unpaintedVisibleRowIds.join(",")}`,
		});
	}
	for (const resource of input.resources) {
		candidates.push({
			duration: resource.elapsed,
			label: `${resource.kind} resource in flight ${resource.elapsed.toFixed(1)}ms`,
		});
	}
	for (const paint of input.paintedRows) {
		if (paint.paintLagMs !== null) {
			candidates.push({
				duration: paint.paintLagMs,
				label: `row ${paint.rowId} paint lag ${paint.paintLagMs.toFixed(1)}ms`,
			});
		}
	}
	return (
		candidates.sort((left, right) => right.duration - left.duration)[0]
			?.label ?? null
	);
}

function emptyFrameAnatomy(): TranscriptForensicsFrameAnatomy {
	return {
		attributed: false,
		blindWindows: [],
		flags: [],
		input: { wheelEventCount: 0, worstQueueingDelayMs: null },
		layout: { duration: 0, forcedReflowCount: 0 },
		network: [],
		paint: {
			blankPts: 0,
			blankRowIds: [],
			maskedGapPts: 0,
			paintedRows: [],
			trueBlankPts: 0,
			unpaintedVisibleRowIds: [],
		},
		react: {
			commitCount: 0,
			committedRowIds: [],
			commits: [],
			mountedRowIds: [],
		},
		scripts: { longAnimationFrames: [], suspectMarks: [] },
		topCause: null,
	};
}

function intervalsOverlap(
	leftStart: number,
	leftEnd: number,
	rightStart: number,
	rightEnd: number,
) {
	return leftStart <= rightEnd && rightStart <= leftEnd;
}

function aggregateMounts(
	mounts: readonly TranscriptForensicsMount[],
	getKey: (mount: TranscriptForensicsMount) => string,
) {
	const values = new Map<string, number[]>();
	for (const mount of mounts) {
		const key = getKey(mount);
		const durations = values.get(key) ?? [];
		durations.push(mount.duration);
		values.set(key, durations);
	}
	return [...values.entries()]
		.map<TranscriptForensicsMountAggregate>(([key, durations]) => {
			const totalDuration = durations.reduce(
				(total, duration) => total + duration,
				0,
			);
			return {
				count: durations.length,
				key,
				maxDuration: Math.max(...durations),
				meanDuration: totalDuration / durations.length,
				totalDuration,
			};
		})
		.sort((left, right) => right.totalDuration - left.totalDuration);
}

function recordMeasuredInterval(
	name: string,
	startTime: number,
	duration: number,
	detail: Readonly<Record<string, string | number | boolean>> | undefined,
	recordAsSuspect: boolean,
) {
	try {
		performance.measure(`transcript:${name}`, {
			detail,
			duration: Math.max(0, duration),
			start: Math.max(0, startTime),
		});
	} catch {
		// Older engines can omit measure-options support; the in-memory ledger
		// remains authoritative for the forensic dump.
	}
	if (recordAsSuspect && runtime) {
		pushBounded(
			runtime.suspectMeasures,
			{ detail, duration, name, startTime },
			TRACE_EVENT_LIMIT,
		);
	}
}

function overlapDuration(
	frameStart: number,
	frameEnd: number,
	taskStart: number,
	taskDuration: number,
) {
	const taskEnd = taskStart + taskDuration;
	return Math.max(
		0,
		Math.min(frameEnd, taskEnd) - Math.max(frameStart, taskStart),
	);
}

function average(values: readonly number[]) {
	return values.length === 0
		? 0
		: values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: readonly number[], ratio: number) {
	if (values.length === 0) {
		return null;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
	return sorted[index] ?? null;
}

function emptyFeelScore(): TranscriptForensicsFeelScore {
	return {
		blankMs: 0,
		inputLatencyMs: null,
		lumpCount: 0,
		maskedGapMs: 0,
		maxWheelQueueingDelayMs: null,
		maxFrameGapMs: 0,
		momentumKills: 0,
		p95WheelQueueingDelayMs: null,
		reversalCount: 0,
		trueBlankMs: 0,
	};
}

function pushBounded<TValue>(target: TValue[], value: TValue, limit: number) {
	target.push(value);
	if (target.length > limit) {
		target.splice(0, target.length - limit);
	}
}

function getAnchorJournalSlice(
	journal: readonly TranscriptAnchorJournalEntry[],
	epoch: number | undefined,
) {
	if (epoch === undefined) {
		return journal.slice(-25);
	}
	let startIndex = -1;
	for (let index = journal.length - 1; index >= 0; index -= 1) {
		const entry = journal[index];
		if (entry?.type === "scrollToTurn:start" && entry.epoch === epoch) {
			startIndex = index;
			break;
		}
	}
	if (startIndex < 0) {
		return journal.filter((entry) => "epoch" in entry && entry.epoch === epoch);
	}
	const startEntry = journal[startIndex];
	if (startEntry?.type !== "scrollToTurn:start") {
		return [];
	}
	const precedingEntry = journal[startIndex - 1];
	const firstIndex =
		precedingEntry?.type === "select" &&
		precedingEntry.turnId === startEntry.turnId
			? startIndex - 1
			: startIndex;
	const nextStartIndex = journal.findIndex(
		(entry, index) => index > startIndex && entry.type === "scrollToTurn:start",
	);
	return journal.filter(
		(entry, index) =>
			(index >= firstIndex && (nextStartIndex < 0 || index < nextStartIndex)) ||
			("epoch" in entry && entry.epoch === epoch),
	);
}
