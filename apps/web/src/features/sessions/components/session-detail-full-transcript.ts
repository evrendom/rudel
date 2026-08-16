import type {
	SessionDetailOverview,
	SessionDetailTurn,
} from "@rudel/api-routes";

type TurnSummary = SessionDetailOverview["turnPage"]["items"][number];

export type SessionDetailBodyLoadProgress = {
	completed: number;
	total: number;
};

export type SessionDetailBodyLoadResult = {
	bodies: ReadonlyMap<string, SessionDetailTurn>;
	failures: ReadonlyMap<string, unknown>;
};

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

export async function loadSessionDetailTurnBodies(input: {
	concurrency?: number;
	loadTurn: (turn: TurnSummary) => Promise<SessionDetailTurn>;
	onProgress: (progress: SessionDetailBodyLoadProgress) => void;
	onTurnLoaded?: (turn: TurnSummary, body: SessionDetailTurn) => void;
	signal: AbortSignal;
	shouldStop?: (error: unknown) => boolean;
	turns: readonly TurnSummary[];
}): Promise<SessionDetailBodyLoadResult> {
	const turns = input.turns.filter((turn) => turn.hasBody);
	const bodies = new Map<string, SessionDetailTurn>();
	const failures = new Map<string, unknown>();
	const concurrency = Math.max(
		1,
		Math.min(Math.floor(input.concurrency ?? 3), turns.length || 1),
	);
	let nextIndex = 0;
	let completed = 0;
	input.onProgress({ completed, total: turns.length });

	async function worker() {
		while (nextIndex < turns.length) {
			input.signal.throwIfAborted();
			const turn = turns[nextIndex];
			nextIndex += 1;
			if (!turn) {
				continue;
			}
			try {
				const body = await input.loadTurn(turn);
				bodies.set(turn.turnId, body);
				input.onTurnLoaded?.(turn, body);
			} catch (error) {
				input.signal.throwIfAborted();
				if (input.shouldStop?.(error)) {
					throw error;
				}
				failures.set(turn.turnId, error);
			}
			completed += 1;
			input.onProgress({ completed, total: turns.length });
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	return { bodies, failures };
}
