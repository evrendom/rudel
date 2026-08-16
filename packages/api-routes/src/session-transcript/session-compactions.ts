export type SessionCompaction = {
	key: string;
	timestamp: string;
};

export type SessionCompactionMetadata = {
	compactions: readonly SessionCompaction[];
	hiddenTraceItemIds: ReadonlySet<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function isClaudeCompactionBoundary(record: Record<string, unknown>) {
	return (
		getString(record, "type") === "system" &&
		(getString(record, "subtype") === "compact_boundary" ||
			isRecord(record.compactMetadata))
	);
}

function isClaudeCompactSummary(record: Record<string, unknown>) {
	return (
		getString(record, "type") === "user" && record.isCompactSummary === true
	);
}

function isCodexCompactionBoundary(record: Record<string, unknown>) {
	const lineType = getString(record, "type");
	if (lineType === "compacted" || lineType === "compaction") {
		return true;
	}
	if (lineType !== "event_msg" || !isRecord(record.payload)) {
		return false;
	}
	const payloadType = getString(record.payload, "type");
	return (
		payloadType === "context_compacted" ||
		payloadType === "context_compaction" ||
		payloadType === "compacted" ||
		payloadType === "compaction"
	);
}

function createCompaction(
	record: Record<string, unknown>,
	lineNumber: number,
): SessionCompaction | undefined {
	const timestamp = getString(record, "timestamp");
	if (!timestamp) {
		return undefined;
	}
	return {
		key: getString(record, "uuid") ?? `compaction-${lineNumber}`,
		timestamp,
	};
}

export function extractSessionCompactionMetadata(
	content: string,
): SessionCompactionMetadata {
	const compactions: SessionCompaction[] = [];
	const hiddenTraceItemIds = new Set<string>();
	let hasPendingClaudeBoundary = false;

	for (const [lineIndex, rawLine] of content.split("\n").entries()) {
		if (!rawLine.trim()) {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawLine);
		} catch {
			continue;
		}
		if (!isRecord(parsed)) {
			continue;
		}

		if (isClaudeCompactionBoundary(parsed)) {
			const compaction = createCompaction(parsed, lineIndex + 1);
			if (compaction) {
				compactions.push(compaction);
				hasPendingClaudeBoundary = true;
			}
			const id = getString(parsed, "uuid");
			if (id) {
				hiddenTraceItemIds.add(id);
			}
			continue;
		}

		if (isClaudeCompactSummary(parsed)) {
			const id = getString(parsed, "uuid");
			if (id) {
				hiddenTraceItemIds.add(id);
			}
			if (!hasPendingClaudeBoundary) {
				const compaction = createCompaction(parsed, lineIndex + 1);
				if (compaction) {
					compactions.push(compaction);
				}
			}
			continue;
		}

		if (isCodexCompactionBoundary(parsed)) {
			const compaction = createCompaction(parsed, lineIndex + 1);
			if (compaction) {
				compactions.push(compaction);
			}
			continue;
		}

		if (getString(parsed, "type") === "user") {
			hasPendingClaudeBoundary = false;
		}
	}

	return { compactions, hiddenTraceItemIds };
}

export function assignCompactionsBeforeTurns(
	compactions: readonly SessionCompaction[],
	turnStartTimestamps: readonly (string | undefined)[],
): readonly (readonly SessionCompaction[])[] {
	const compactionsByTurn = turnStartTimestamps.map(
		(): SessionCompaction[] => [],
	);

	for (const compaction of compactions) {
		const compactionTime = Date.parse(compaction.timestamp);
		if (Number.isNaN(compactionTime)) {
			continue;
		}
		for (let index = 0; index < turnStartTimestamps.length; index++) {
			const timestamp = turnStartTimestamps[index];
			if (!timestamp) {
				continue;
			}
			const turnStartTime = Date.parse(timestamp);
			if (Number.isNaN(turnStartTime) || turnStartTime < compactionTime) {
				continue;
			}
			compactionsByTurn[index]?.push(compaction);
			break;
		}
	}

	return compactionsByTurn;
}
