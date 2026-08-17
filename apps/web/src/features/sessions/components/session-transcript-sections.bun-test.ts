import { describe, expect, test } from "bun:test";
import { SessionDetailTurnBodySchema } from "@rudel/api-routes";
import {
	buildSessionDetailOverviewTurnOptions,
	normalizeSessionDetailTurnBody,
} from "./session-detail-overview-model";
import {
	buildSessionTranscriptRowModel,
	createTranscriptSectionCache,
	SECTION_MAX_RENDERED_EVENTS,
	type SessionTranscriptTurnSource,
	stabilizeSessionDetailTurnOptions,
	stabilizeTranscriptRows,
} from "./session-transcript-sections";

const revision = "2026-08-16T08:30:00.123Z";

function option(turnId: string, index: number) {
	const result = buildSessionDetailOverviewTurnOptions([
		{
			activityResolution: "exact",
			durationSeconds: 60,
			editedFiles: [],
			endedAt: "2026-08-16T08:31:00.000Z",
			errorCount: 0,
			errorEvents: [],
			estimatedCost: 0.2,
			hasBody: true,
			index,
			inputTokens: 100,
			outputTokens: 20,
			responsePreview: "Done",
			skills: [],
			skillEvents: [],
			slashCommands: [],
			startedAt: "2026-08-16T08:30:00.000Z",
			toolCallCount: 1,
			turnId,
			usageCalls: [
				{
					at: "2026-08-16T08:30:00.000Z",
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 10,
					contextWindow: 200_000,
					freshInputTokens: 90,
					model: "claude-fable-5",
					outputTokens: 20,
				},
			],
			userPreview: `Prompt ${index}`,
		},
	])[0];
	if (!result) {
		throw new Error("Expected the synthetic turn option");
	}
	return result;
}

function body(turnId: string, eventCount = 2) {
	return normalizeSessionDetailTurnBody(
		SessionDetailTurnBodySchema.parse({
			responseItems: [
				{
					events: Array.from({ length: eventCount }, (_, index) => ({
						id: `${turnId}:tool:${index}`,
						input: { command: `echo ${index}` },
						kind: "tool" as const,
						result: { content: "ok", isError: false },
						timestamp: new Date(
							Date.UTC(2026, 7, 16, 8, 30, index),
						).toISOString(),
						toolName: "Bash",
					})),
					executionMode: "default",
					id: `${turnId}:agent`,
					kind: "agent",
					timestamp: "2026-08-16T08:30:00.000Z",
				},
			],
			userItems: [
				{
					content: `Prompt ${turnId}`,
					id: `${turnId}:user`,
					kind: "user",
					timestamp: "2026-08-16T08:29:59.000Z",
				},
			],
		}),
	);
}

function source(
	turnId: string,
	index: number,
	turnBody = body(turnId),
): SessionTranscriptTurnSource {
	return {
		body: turnBody,
		option: option(turnId, index),
		requestUsagePlacement: "start",
	};
}

function model(
	turns: readonly SessionTranscriptTurnSource[],
	level: "normal" | "request" = "request",
	revisionValue = revision,
) {
	return buildSessionTranscriptRowModel({
		cache: sharedCache,
		includeSubagentsAnchor: true,
		level,
		newerEdge: "idle",
		olderEdge: "idle",
		revision: revisionValue,
		turns,
	});
}

let sharedCache = createTranscriptSectionCache();

describe("session transcript sections and rows", () => {
	test("caps a legal giant request and emits an accurately counted overflow row", () => {
		sharedCache = createTranscriptSectionCache();
		const rows = model([source("turn-1", 0, body("turn-1", 75))]).rows;
		const section = rows.find((row) => row.kind === "section");
		const overflow = rows.find((row) => row.kind === "section-overflow");

		expect(section?.kind).toBe("section");
		if (section?.kind !== "section") {
			throw new Error("Expected a derived section row");
		}
		expect(section.section.payload.traceSection.kind).toBe("agent");
		if (section.section.payload.traceSection.kind !== "agent") {
			throw new Error("Expected an agent section");
		}
		expect(section.section.payload.traceSection.events).toHaveLength(
			SECTION_MAX_RENDERED_EVENTS,
		);
		expect(overflow).toMatchObject({
			hidden: { events: 15, kindLabel: "activity events" },
			kind: "section-overflow",
		});
	});

	test("keeps the first render of the 100k-event contract maximum bounded", () => {
		sharedCache = createTranscriptSectionCache();
		const startedAt = performance.now();
		const rows = model([
			source("turn-giant", 0, body("turn-giant", 100_000)),
		]).rows;
		const elapsedMs = performance.now() - startedAt;
		const section = rows.find((row) => row.kind === "section");
		const overflow = rows.find((row) => row.kind === "section-overflow");

		if (section?.kind !== "section") {
			throw new Error("Expected the giant derived section");
		}
		expect(section.section.payload.traceSection.kind).toBe("agent");
		expect(overflow).toMatchObject({ hidden: { events: 99_940 } });
		expect(elapsedMs).toBeLessThan(5_000);
	});

	test("externalizes positions while preserving row references across prepends", () => {
		sharedCache = createTranscriptSectionCache();
		const turn2 = source("turn-2", 1);
		const first = model([turn2]);
		const sectionBefore = first.rows.find((row) => row.id === "turn-2:s0");
		const next = model([source("turn-1", 0), turn2]);
		const stable = stabilizeTranscriptRows(first.rows, next.rows);
		const sectionAfter = stable.find((row) => row.id === "turn-2:s0");

		expect(sectionAfter).toBe(sectionBefore);
		expect(next.turnFirstRowIndex.get("turn-2")).toBeGreaterThan(
			first.turnFirstRowIndex.get("turn-2") ?? -1,
		);
		expect(next.rowTurnIndex.get("turn-2:s0")).toBe(1);
	});

	test("invalidates only the layers affected by body, level, revision, and edge state", () => {
		sharedCache = createTranscriptSectionCache();
		const pendingSource: SessionTranscriptTurnSource = {
			body: undefined,
			bodyState: "loading",
			option: option("turn-1", 0),
			requestUsagePlacement: "start",
		};
		const pending = model([pendingSource]);
		expect(pending.rows.some((row) => row.kind === "turn-pending")).toBe(true);

		const hydratedSource = {
			...pendingSource,
			body: body("turn-1"),
		};
		const hydrated = model([hydratedSource]);
		const requestSection = hydrated.rows.find((row) => row.kind === "section");
		const sameDebugIndependentBuild = model([hydratedSource]);
		const sameSection = sameDebugIndependentBuild.rows.find(
			(row) => row.kind === "section",
		);
		if (requestSection?.kind !== "section" || sameSection?.kind !== "section") {
			throw new Error("Expected cached section rows");
		}
		expect(sameSection.section).toBe(requestSection.section);

		const normal = model([hydratedSource], "normal");
		const newRevision = model(
			[hydratedSource],
			"request",
			"2026-08-16T08:31:00.456Z",
		);
		expect(normal.rows.find((row) => row.kind === "section")).not.toBe(
			requestSection,
		);
		expect(newRevision.rows.find((row) => row.kind === "section")).not.toBe(
			requestSection,
		);

		const loadingEdge = buildSessionTranscriptRowModel({
			cache: sharedCache,
			level: "request",
			newerEdge: "loading",
			revision,
			turns: [hydratedSource],
		});
		const stable = stabilizeTranscriptRows(hydrated.rows, loadingEdge.rows);
		expect(stable.find((row) => row.kind === "window-edge")).toMatchObject({
			state: "loading",
		});
	});

	test("reuses shallow-equivalent options and bounds the section cache", () => {
		const first = [option("turn-1", 0), option("turn-2", 1)];
		const stable = stabilizeSessionDetailTurnOptions(first, [
			option("turn-0", 0),
			option("turn-1", 0),
			option("turn-2", 1),
		]);
		expect(stable[1]).toBe(first[0]);
		expect(stable[2]).toBe(first[1]);

		const cache = createTranscriptSectionCache(2);
		for (let index = 0; index < 3; index += 1) {
			const turn = source(`turn-${index}`, index);
			if (!turn.body) {
				throw new Error("Expected the synthetic turn body");
			}
			cache.get({
				body: turn.body,
				level: "request",
				option: turn.option,
				requestUsagePlacement: "start",
				revision,
			});
		}
		expect(cache.size).toBe(2);
	});
});
