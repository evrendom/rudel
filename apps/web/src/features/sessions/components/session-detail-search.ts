import {
	type SessionDetailTurn,
	toolResultText,
	userContentText,
} from "@rudel/api-routes";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";

const SEARCH_SNIPPET_CONTEXT_CHARACTERS = 72;

type SessionDetailSearchResult = {
	index: number;
	snippet: string;
	turnId: string;
	turnNumber: number | undefined;
};

export type SessionDetailSearchIndex = ReadonlyMap<string, readonly string[]>;

type SessionDetailSearchPayload = {
	index: SessionDetailSearchIndex;
};

export type SessionDetailSearchLoadState =
	| { status: "idle" }
	| (SessionDetailSearchPayload & {
			completed: number;
			phase: "pages" | "turns";
			status: "loading";
			total: number;
	  })
	| (SessionDetailSearchPayload & {
			failedTurnIds: readonly string[];
			status: "failed";
	  })
	| (SessionDetailSearchPayload & { status: "complete" })
	| (SessionDetailSearchPayload & {
			completed: number;
			status: "cancelled";
			total: number;
	  });

export function searchSessionDetailTurns(input: {
	index: SessionDetailSearchIndex;
	options: readonly SessionDetailOverviewTurnOption[];
	query: string;
}): SessionDetailSearchResult[] {
	const normalizedQuery = input.query.trim().toLocaleLowerCase();
	if (!normalizedQuery) {
		return [];
	}

	const results: SessionDetailSearchResult[] = [];
	for (const [index, option] of input.options.entries()) {
		const candidates = [
			option.memberPreview,
			option.preview,
			...(input.index.get(option.turnId) ?? []),
		];
		const match = candidates.find((candidate) =>
			candidate.toLocaleLowerCase().includes(normalizedQuery),
		);
		if (!match) {
			continue;
		}
		results.push({
			index,
			snippet: buildSearchSnippet(match, normalizedQuery),
			turnId: option.turnId,
			turnNumber: option.turnNumber,
		});
	}
	return results;
}

export function getSessionDetailTurnSearchText(turn: {
	responseItems: SessionDetailTurn["responseItems"];
	userItems: SessionDetailTurn["userItems"];
}) {
	return [...turn.userItems, ...turn.responseItems].flatMap(getTraceItemText);
}

function getTraceItemText(
	item: SessionDetailTurn["userItems"][number],
): string[] {
	if (item.kind === "user") {
		return [userContentText(item.content)];
	}
	if (item.kind === "summary" || item.kind === "system") {
		return [item.text];
	}
	return item.events.flatMap((event) => {
		if (event.kind === "reasoning" || event.kind === "message") {
			return [event.text];
		}
		if (event.kind === "orphan-result") {
			return [toolResultText(event.result.content)];
		}
		return [
			event.toolName,
			JSON.stringify(event.input),
			event.result ? toolResultText(event.result.content) : "",
			event.skillContent?.content ?? "",
		];
	});
}

function buildSearchSnippet(text: string, normalizedQuery: string) {
	const normalizedText = text.replace(/\s+/gu, " ").trim();
	const matchIndex = normalizedText
		.toLocaleLowerCase()
		.indexOf(normalizedQuery);
	const start = Math.max(0, matchIndex - SEARCH_SNIPPET_CONTEXT_CHARACTERS);
	const end = Math.min(
		normalizedText.length,
		matchIndex + normalizedQuery.length + SEARCH_SNIPPET_CONTEXT_CHARACTERS,
	);
	return `${start > 0 ? "…" : ""}${normalizedText.slice(start, end)}${
		end < normalizedText.length ? "…" : ""
	}`;
}
