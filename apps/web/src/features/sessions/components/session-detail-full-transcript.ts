import type { NormalizedSessionDetailOverview } from "./session-detail-fast-response";

export async function loadRemainingSessionDetailOverviewPages(input: {
	first: NormalizedSessionDetailOverview;
	loadPage: (cursor: string) => Promise<NormalizedSessionDetailOverview>;
	signal: AbortSignal;
}) {
	const pages: NormalizedSessionDetailOverview[] = [];
	const visitedCursors = new Set<string>();
	let current = input.first;

	while (current.turnPage.nextCursor) {
		input.signal.throwIfAborted();
		const cursor = current.turnPage.nextCursor;
		if (visitedCursors.has(cursor)) {
			throw new Error("Session detail pagination returned a repeated cursor.");
		}
		visitedCursors.add(cursor);
		const page = await input.loadPage(cursor);
		if (page.revision !== input.first.revision) {
			throw new Error("Session detail pagination mixed revisions.");
		}
		if (!hasSameActivityTotals(page, input.first)) {
			throw new Error("Session detail pagination mixed activity totals.");
		}
		pages.push(page);
		current = page;
	}

	return pages;
}

function hasSameActivityTotals(
	left: NormalizedSessionDetailOverview,
	right: NormalizedSessionDetailOverview,
) {
	if (
		left.activityTotalsScope === "page" ||
		right.activityTotalsScope === "page"
	) {
		return true;
	}
	return (
		left.activityTotals.edit === right.activityTotals.edit &&
		left.activityTotals.error === right.activityTotals.error &&
		left.activityTotals.read === right.activityTotals.read &&
		left.activityTotals.signal === right.activityTotals.signal &&
		left.activityTotals.signalScanVersion ===
			right.activityTotals.signalScanVersion &&
		left.activityTotals.skill === right.activityTotals.skill &&
		left.activityTotals.subagent === right.activityTotals.subagent &&
		left.activityTotals.write === right.activityTotals.write
	);
}
