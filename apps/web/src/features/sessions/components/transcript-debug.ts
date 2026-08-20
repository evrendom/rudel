export type TranscriptDebugSnapshot = {
	activeTurn: number | undefined;
	bodyTurns: number;
	lastGap: number;
	maskedGapFrames: number;
	pending: number;
	scrollMode: "anchoring-turn" | "free-scrolling" | "soft-anchored";
	visibleRange: readonly [number, number] | undefined;
	windows: number;
	trueBlankFrames: number;
};

export function publishTranscriptDebugSnapshot(
	element: HTMLElement,
	snapshot: TranscriptDebugSnapshot,
) {
	element.dataset.transcriptScrollMode = snapshot.scrollMode;
	element.dataset.transcriptActiveTurn =
		snapshot.activeTurn === undefined ? "" : String(snapshot.activeTurn);
	element.dataset.transcriptVisibleRange = snapshot.visibleRange
		? `${snapshot.visibleRange[0]}:${snapshot.visibleRange[1]}`
		: "";
	element.dataset.transcriptWindows = String(snapshot.windows);
	element.dataset.transcriptBodyTurns = String(snapshot.bodyTurns);
	element.dataset.transcriptPending = String(snapshot.pending);
	element.dataset.transcriptMaskedGapFrames = String(snapshot.maskedGapFrames);
	element.dataset.transcriptTrueBlankFrames = String(snapshot.trueBlankFrames);
	element.dataset.transcriptBlankGap = String(snapshot.lastGap);
}

export function markTranscriptMeasure(
	name:
		| "anchor"
		| "body-normalize"
		| "derive"
		| "level-switch"
		| "model-build"
		| "window-fetch",
	phase: "end" | "start",
	enabled: boolean,
) {
	if (!enabled || typeof performance === "undefined") {
		return;
	}
	const measureName = `transcript:${name}`;
	const markName = `${measureName}:${phase}`;
	performance.mark(markName);
	if (phase === "end") {
		performance.measure(measureName, `${measureName}:start`, markName);
	}
}
