export type TranscriptDebugSnapshot = {
	activeTurn: number | undefined;
	blankFrames: number;
	bodyTurns: number;
	lastGap: number;
	pending: number;
	scrollMode: "anchoring-turn" | "free-scrolling";
	visibleRange: readonly [number, number] | undefined;
	windows: number;
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
	element.dataset.transcriptBlankFrames = String(snapshot.blankFrames);
	element.dataset.transcriptBlankGap = String(snapshot.lastGap);
	const hud = element.querySelector<HTMLOutputElement>(
		"[data-transcript-debug-hud]",
	);
	if (hud) {
		hud.textContent = [
			snapshot.scrollMode,
			`active ${snapshot.activeTurn ?? "–"}`,
			`visible ${snapshot.visibleRange?.join("–") ?? "–"}`,
			`${snapshot.windows} windows`,
			`${snapshot.bodyTurns} bodies`,
			`${snapshot.pending} pending`,
			`${snapshot.blankFrames} blank`,
		].join(" · ");
	}
}

export function markTranscriptMeasure(
	name: "anchor" | "derive" | "level-switch" | "window-fetch",
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
