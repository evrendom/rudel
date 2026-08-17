import type { SessionDetailOverview } from "@rudel/api-routes";

export async function loadRemainingSessionDetailOverviewPages(input: {
	first: SessionDetailOverview;
	loadPage: (cursor: string) => Promise<SessionDetailOverview>;
	signal: AbortSignal;
}) {
	const pages: SessionDetailOverview[] = [];
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
		pages.push(page);
		current = page;
	}

	return pages;
}
