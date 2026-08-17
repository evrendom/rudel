// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: The forensic controller keeps one clock and one ring-buffer schema so frame correlations cannot drift across modules.
const TRACE_FRAME_LIMIT = 7_200;
const TRACE_EVENT_LIMIT = 10_000;
const ACTIVE_INPUT_WINDOW_MS = 32;
const EXPENSIVE_MOUNT_WINDOW_MS = 10_000;

export type TranscriptProgrammaticWriteCause =
	| "prepend-anchor"
	| "resize-adjustment"
	| "turn-anchor"
	| "virtualizer";

export type TranscriptForensicsContentFlags = {
	charCount: number;
	eventCount: number;
	hasCodeBlock: boolean;
};

export type TranscriptForensicsFeelScore = {
	inputLatencyMs: number | null;
	lumpCount: number;
	maxFrameGapMs: number;
	momentumKills: number;
	reversalCount: number;
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
	at: number;
	blankPts: number;
	blankSamples: readonly boolean[];
	frameMs: number;
	longTaskMs: number;
	mounted: readonly string[];
	moved: number;
	phase: "coast" | "idle" | "input";
	progWrites: readonly TranscriptForensicsProgrammaticWrite[];
	scrollTop: number;
	suspectMarks: readonly string[];
	unmounted: readonly string[];
	userDelta: number;
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
	createdAt: string;
	feelScore: TranscriptForensicsFeelScore;
	frames: readonly TranscriptForensicsFrame[];
	lifecycles: readonly TranscriptForensicsLifecycle[];
	measurements: readonly TranscriptForensicsMeasure[];
	mountAggregates: {
		byContentFlags: readonly TranscriptForensicsMountAggregate[];
		byKind: readonly TranscriptForensicsMountAggregate[];
	};
	mounts: readonly TranscriptForensicsMount[];
	runs: readonly TranscriptForensicsRun[];
	suspectMeasures: readonly TranscriptForensicsSuspectMeasure[];
	version: 1;
};

export type TranscriptForensicsController = {
	beginRun: (label: string, expectedDirection?: -1 | 1) => void;
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

type RuntimeState = {
	activeRun: ActiveRun | undefined;
	adjustments: TranscriptForensicsAdjustment[];
	attachmentVersion: number;
	controller: TranscriptForensicsController;
	frameHandle: number | undefined;
	frames: TranscriptForensicsFrame[];
	lastFrameAt: number;
	lastScrollTop: number;
	lifecycles: TranscriptForensicsLifecycle[];
	longTasks: LongTaskRecord[];
	measurements: TranscriptForensicsMeasure[];
	mounts: TranscriptForensicsMount[];
	observer: PerformanceObserver | undefined;
	pendingMounted: string[];
	pendingUnmounted: string[];
	pendingUserDelta: number;
	pendingWrites: TranscriptForensicsProgrammaticWrite[];
	runs: TranscriptForensicsRun[];
	scrollElement: HTMLElement | undefined;
	suspectMeasures: TranscriptForensicsSuspectMeasure[];
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
	trace.wheelListener = (event) => {
		trace.pendingUserDelta += event.deltaY;
		if (trace.activeRun) {
			const now = performance.now();
			const eventAt =
				event.timeStamp >= 0 && event.timeStamp <= now + 1_000
					? event.timeStamp
					: now;
			trace.activeRun.firstInputAt ??= eventAt;
			trace.activeRun.lastInputAt = eventAt;
			trace.activeRun.inputEventCount += 1;
			if (event.deltaY !== 0) {
				trace.activeRun.expectedDirection = event.deltaY > 0 ? 1 : -1;
			}
		}
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
	phase: "mount" | "unmount",
) {
	if (!runtime) {
		return;
	}
	const target =
		phase === "mount" ? runtime.pendingMounted : runtime.pendingUnmounted;
	pushBounded(target, rowId, TRACE_EVENT_LIMIT);
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

export function publishTranscriptForensicsHud(element: HTMLElement) {
	if (!runtime) {
		return;
	}
	const hud = element.querySelector<HTMLOutputElement>(
		"[data-transcript-debug-hud]",
	);
	if (!hud) {
		return;
	}
	const score = getCurrentFeelScore(runtime);
	const recentMounts = runtime.mounts
		.filter(
			(mount) => performance.now() - mount.at <= EXPENSIVE_MOUNT_WINDOW_MS,
		)
		.sort((left, right) => right.duration - left.duration)
		.slice(0, 5)
		.map(
			(mount) =>
				`${mount.rowKind}:${mount.rowId} ${mount.duration.toFixed(1)}ms`,
		);
	const base = element.dataset.transcriptDebugBaseHud;
	hud.textContent = [
		base,
		`feel latency ${formatMetric(score.inputLatencyMs)} · gap ${score.maxFrameGapMs.toFixed(1)}ms · lumps ${score.lumpCount} · reversals ${score.reversalCount} · kills ${score.momentumKills}`,
		recentMounts.length > 0
			? `mount top5 ${recentMounts.join(" | ")}`
			: undefined,
	]
		.filter((part) => part !== undefined && part.length > 0)
		.join("\n");
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
		dump: () => buildDump(trace),
		endRun: () => endActiveRun(trace),
		recordSyntaxHighlight: (input) => recordTranscriptSyntaxHighlight(input),
		reset: () => resetRuntime(trace),
	};
	trace = {
		activeRun: undefined,
		adjustments: [],
		attachmentVersion: 0,
		controller,
		frameHandle: undefined,
		frames: [],
		lastFrameAt: performance.now(),
		lastScrollTop: 0,
		lifecycles: [],
		longTasks: [],
		measurements: [],
		mounts: [],
		observer: undefined,
		pendingMounted: [],
		pendingUnmounted: [],
		pendingUserDelta: 0,
		pendingWrites: [],
		runs: [],
		scrollElement: undefined,
		suspectMeasures: [],
		wheelListener: undefined,
	};
	if (
		typeof PerformanceObserver === "function" &&
		PerformanceObserver.supportedEntryTypes.includes("longtask")
	) {
		trace.observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				pushBounded(
					trace.longTasks,
					{ duration: entry.duration, startTime: entry.startTime },
					TRACE_EVENT_LIMIT,
				);
			}
		});
		trace.observer.observe({ entryTypes: ["longtask"] });
	}
	return trace;
}

function startFrameLoop(trace: RuntimeState) {
	const tick = (at: number) => {
		trace.frameHandle = undefined;
		const element = trace.scrollElement;
		if (!element) {
			return;
		}
		const previousFrameAt = trace.lastFrameAt;
		const scrollTop = element.scrollTop;
		const moved = scrollTop - trace.lastScrollTop;
		const userDelta = trace.pendingUserDelta;
		const progWrites = trace.pendingWrites.splice(0);
		const mounted = trace.pendingMounted.splice(0);
		const unmounted = trace.pendingUnmounted.splice(0);
		trace.pendingUserDelta = 0;
		const blankSamples = sampleBlankPoints(element);
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
		pushBounded(
			trace.frames,
			{
				at,
				blankPts: blankSamples.filter(Boolean).length,
				blankSamples,
				frameMs: at - previousFrameAt,
				longTaskMs,
				mounted,
				moved,
				phase,
				progWrites,
				scrollTop,
				suspectMarks,
				unmounted,
				userDelta,
			},
			TRACE_FRAME_LIMIT,
		);
		trace.lastFrameAt = at;
		trace.lastScrollTop = scrollTop;
		publishTranscriptForensicsHud(element);
		trace.frameHandle = window.requestAnimationFrame(tick);
	};
	trace.frameHandle = window.requestAnimationFrame(tick);
}

function detachRuntimeScroller(trace: RuntimeState) {
	if (trace.scrollElement && trace.wheelListener) {
		trace.scrollElement.removeEventListener("wheel", trace.wheelListener);
	}
	if (trace.frameHandle !== undefined) {
		window.cancelAnimationFrame(trace.frameHandle);
	}
	trace.frameHandle = undefined;
	trace.scrollElement = undefined;
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
	const run: TranscriptForensicsRun = {
		endedAt,
		expectedDirection: activeRun.expectedDirection,
		feelScore: computeFeelScore(frames, activeRun),
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
	);
}

function computeFeelScore(
	frames: readonly TranscriptForensicsFrame[],
	run: ActiveRun,
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
		inputLatencyMs,
		lumpCount,
		maxFrameGapMs,
		momentumKills,
		reversalCount,
	};
}

function sampleBlankPoints(element: HTMLElement) {
	const bounds = element.getBoundingClientRect();
	const x = bounds.left + bounds.width / 2;
	return [0.1, 0.3, 0.5, 0.7, 0.9].map((ratio) => {
		const y = bounds.top + bounds.height * ratio;
		const target = document.elementFromPoint(x, y);
		return !(
			target instanceof Element &&
			element.contains(target) &&
			target.closest("[data-transcript-row-id]")
		);
	});
}

function buildDump(trace: RuntimeState): TranscriptForensicsDump {
	return {
		adjustments: [...trace.adjustments],
		createdAt: new Date().toISOString(),
		feelScore: getCurrentFeelScore(trace),
		frames: [...trace.frames],
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
		runs: [...trace.runs],
		suspectMeasures: [...trace.suspectMeasures],
		version: 1,
	};
}

function resetRuntime(trace: RuntimeState) {
	trace.activeRun = undefined;
	trace.adjustments.length = 0;
	trace.frames.length = 0;
	trace.lastFrameAt = performance.now();
	trace.lastScrollTop = trace.scrollElement?.scrollTop ?? 0;
	trace.longTasks.length = 0;
	trace.measurements.length = 0;
	trace.mounts.length = 0;
	trace.pendingMounted.length = 0;
	trace.pendingUnmounted.length = 0;
	trace.pendingUserDelta = 0;
	trace.pendingWrites.length = 0;
	trace.runs.length = 0;
	trace.suspectMeasures.length = 0;
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

function emptyFeelScore(): TranscriptForensicsFeelScore {
	return {
		inputLatencyMs: null,
		lumpCount: 0,
		maxFrameGapMs: 0,
		momentumKills: 0,
		reversalCount: 0,
	};
}

function formatMetric(value: number | null) {
	return value === null ? "–" : `${value.toFixed(1)}ms`;
}

function pushBounded<TValue>(target: TValue[], value: TValue, limit: number) {
	target.push(value);
	if (target.length > limit) {
		target.splice(0, target.length - limit);
	}
}
