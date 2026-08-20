// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Transcript section parity, cache identity, and fold invariants share the same fixture builders.
import { describe, expect, test } from "bun:test";
import { SessionDetailTurnBodySchema } from "@rudel/api-routes";
import type { TraceEvent } from "@/components/conversation/conversation-trace";
import {
	type ConversationTraceAgentSection,
	deriveConversationTraceSections,
} from "@/components/conversation/conversation-trace-sections";
import { getAgentTraceTreeEventGeometry } from "@/components/conversation/conversation-trace-tree-branches";
import {
	buildSessionDetailOverviewTurnOptions,
	normalizeSessionDetailTurnBody,
} from "./session-detail-overview-model";
import { splitAgentSectionByEstimatedHeight } from "./session-transcript-section-budget";
import {
	buildSessionTranscriptRowModel,
	createTranscriptSectionCache,
	SECTION_MAX_ESTIMATED_PX,
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
			modelSignalCount: 0,
			outputTokens: 20,
			responsePreview: "Done",
			signalCount: 0,
			signalOccurrences: [],
			signalOccurrencesOmittedCount: 0,
			signalOccurrencesTruncated: false,
			skills: [],
			skillCount: 0,
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

function foldBody(turnId: string) {
	const timestamp = (second: number) =>
		new Date(Date.UTC(2026, 7, 16, 8, 30, second)).toISOString();
	const tool = (
		id: string,
		second: number,
		overrides: {
			isError?: boolean;
			toolName?: string;
		} = {},
	) => ({
		id,
		input: { command: id },
		kind: "tool" as const,
		result: { content: "result", isError: overrides.isError ?? false },
		timestamp: timestamp(second),
		toolName: overrides.toolName ?? "Bash",
	});
	const agent = (
		id: string,
		events: ReturnType<typeof tool>[] | Array<Record<string, unknown>>,
		second: number,
	) => ({
		events,
		executionMode: "default" as const,
		id,
		kind: "agent" as const,
		timestamp: timestamp(second),
	});
	return normalizeSessionDetailTurnBody(
		SessionDetailTurnBodySchema.parse({
			responseItems: [
				agent(
					`${turnId}:agent:one`,
					[
						{
							id: `${turnId}:reasoning`,
							kind: "reasoning" as const,
							text: "Planning",
							timestamp: timestamp(0),
						},
						{
							content: "Intermediate update",
							id: `${turnId}:message:intermediate`,
							kind: "message" as const,
							text: "Intermediate update",
							timestamp: timestamp(0),
						},
						tool(`${turnId}:tool:hidden-one`, 1),
						tool(`${turnId}:tool:skill`, 1, { toolName: "Skill" }),
						tool(`${turnId}:tool:read`, 1, { toolName: "Read" }),
						tool(`${turnId}:tool:write`, 1, { toolName: "Write" }),
						tool(`${turnId}:tool:edit`, 1, { toolName: "Edit" }),
						tool(`${turnId}:tool:notebook-edit`, 1, {
							toolName: "NotebookEdit",
						}),
					],
					0,
				),
				{
					id: `${turnId}:notification`,
					kind: "system" as const,
					systemType: "notification" as const,
					text: "Keep this notification visible",
					timestamp: timestamp(2),
				},
				agent(
					`${turnId}:agent:spawn`,
					[tool(`${turnId}:tool:spawn`, 3, { toolName: "Agent" })],
					3,
				),
				{
					id: `${turnId}:interruption`,
					kind: "system" as const,
					systemType: "interruption" as const,
					text: "Keep this interruption visible",
					timestamp: timestamp(4),
				},
				agent(
					`${turnId}:agent:error`,
					[tool(`${turnId}:tool:error`, 5, { isError: true })],
					5,
				),
				{
					id: `${turnId}:summary`,
					kind: "summary" as const,
					text: "Keep this compaction summary visible",
					timestamp: undefined,
				},
				agent(`${turnId}:agent:two`, [tool(`${turnId}:tool:hidden-two`, 6)], 6),
				{
					id: `${turnId}:context`,
					kind: "system" as const,
					systemType: "context" as const,
					text: "Context boundary",
					timestamp: timestamp(7),
				},
				agent(
					`${turnId}:agent:last`,
					[
						tool(`${turnId}:tool:last`, 8),
						{
							content: "Terminal answer",
							id: `${turnId}:message:terminal`,
							kind: "message" as const,
							text: "Terminal answer",
							timestamp: timestamp(9),
						},
					],
					8,
				),
			],
			userItems: [],
		}),
	);
}

function interruptedFoldBody(turnId: string) {
	const completeBody = foldBody(turnId);
	const interruptionIndex = completeBody.responseItems.findIndex(
		(item) => item.kind === "system" && item.systemType === "interruption",
	);
	if (interruptionIndex < 0) {
		throw new Error("Expected the synthetic interruption item");
	}
	return {
		...completeBody,
		responseItems: completeBody.responseItems.slice(0, interruptionIndex + 1),
	};
}

function codexInterruptedFoldBody(turnId: string) {
	const interruptedBody = interruptedFoldBody(turnId);
	return normalizeSessionDetailTurnBody(
		SessionDetailTurnBodySchema.parse({
			...interruptedBody,
			responseItems: interruptedBody.responseItems.map((item) =>
				item.kind === "system" && item.systemType === "interruption"
					? { ...item, systemType: "system", text: "Turn aborted" }
					: item,
			),
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

function splitGeometryEvents(): TraceEvent[] {
	const timestamp = (second: number) =>
		new Date(Date.UTC(2026, 7, 16, 8, 30, second)).toISOString();
	const events: TraceEvent[] = [];
	for (let branchIndex = 0; branchIndex < 3; branchIndex += 1) {
		events.push({
			id: `geometry:reasoning:${branchIndex}`,
			kind: "reasoning",
			text: `Branch ${branchIndex}`,
			timestamp: timestamp(branchIndex * 10),
		});
		for (let childIndex = 0; childIndex < 7; childIndex += 1) {
			events.push({
				id: `geometry:tool:${branchIndex}:${childIndex}`,
				input: { command: `echo ${branchIndex}:${childIndex}` },
				kind: "tool",
				result: { content: "ok", isError: false },
				timestamp: timestamp(branchIndex * 10 + childIndex + 1),
				toolName: "Bash",
			});
		}
	}
	return events;
}

function sectionGeometry(section: ConversationTraceAgentSection) {
	return section.branches.flatMap((branch) =>
		getAgentTraceTreeEventGeometry(branch, false).map((geometry) => ({
			continues: geometry.continues,
			depth: section.branchDepth + geometry.depthOffset,
			descends: geometry.descends,
			id: geometry.event.id,
			parentContinues: geometry.parentContinues,
		})),
	);
}

function model(
	turns: readonly SessionTranscriptTurnSource[],
	level: "normal" | "request" = "request",
	revisionValue = revision,
	folds?: {
		expandedTurnIds: ReadonlySet<string>;
		protectedTurnIds: ReadonlySet<string>;
	},
) {
	return buildSessionTranscriptRowModel({
		cache: sharedCache,
		folds,
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
	test("preserves unsplit tree geometry across every section budget", () => {
		for (const level of ["normal", "request"] as const) {
			const derivation = deriveConversationTraceSections({
				items: [
					{
						events: splitGeometryEvents(),
						executionMode: "default",
						id: "geometry:agent",
						kind: "agent",
						timestamp: "2026-08-16T08:30:00.000Z",
					},
				],
				requestUsage: [
					{
						at: "2026-08-16T08:30:00.000Z",
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0,
						inputTokens: 100,
						model: "claude-fable-5",
						outputTokens: 20,
					},
				],
				traceCallDisplayMode: level,
			});
			const section = derivation.sections[0];
			if (section?.kind !== "agent") {
				throw new Error("Expected an agent geometry section");
			}
			const unsplitGeometry = sectionGeometry(section);

			for (const budget of [96, 128, 160, 224, 320]) {
				const chunks = splitAgentSectionByEstimatedHeight(section, budget);
				const splitGeometry = chunks.flatMap((chunk) =>
					sectionGeometry(chunk.section),
				);
				expect(splitGeometry).toEqual(unsplitGeometry);
				expect(chunks[0]?.section.continuesFromPrevious).toBe(false);
				expect(chunks.at(-1)?.section.continuesToNext).toBe(false);
				expect(
					chunks.slice(1).every((chunk) => {
						return (
							chunk.section.continuesFromPrevious && !chunk.section.showHeader
						);
					}),
				).toBe(true);
				expect(
					chunks.slice(0, -1).every((chunk) => chunk.section.continuesToNext),
				).toBe(true);
			}

			expect(
				splitAgentSectionByEstimatedHeight(section, 160).length,
			).toBeGreaterThanOrEqual(3);
		}
	});

	test("caps a legal giant request and emits an accurately counted overflow row", () => {
		sharedCache = createTranscriptSectionCache();
		const rows = model([source("turn-1", 0, body("turn-1", 75))]).rows;
		const sections = rows.filter((row) => row.kind === "section");
		const section = sections[0];
		const overflow = rows.find((row) => row.kind === "section-overflow");

		expect(section?.kind).toBe("section");
		if (section?.kind !== "section") {
			throw new Error("Expected a derived section row");
		}
		expect(section.section.payload.traceSection.kind).toBe("agent");
		if (section.section.payload.traceSection.kind !== "agent") {
			throw new Error("Expected an agent section");
		}
		expect(
			sections.reduce(
				(total, row) =>
					total +
					(row.kind === "section" &&
					row.section.payload.traceSection.kind === "agent"
						? row.section.payload.traceSection.events.length
						: 0),
				0,
			),
		).toBe(SECTION_MAX_RENDERED_EVENTS);
		expect(
			sections.every(
				(row) =>
					row.kind === "section" &&
					row.section.estimatedHeight <= SECTION_MAX_ESTIMATED_PX,
			),
		).toBe(true);
		expect(sections[1]?.id).toBe("turn-1:s0b1");
		expect(
			sections[1]?.kind === "section" &&
				sections[1].section.payload.traceSection.kind === "agent"
				? sections[1].section.payload.traceSection.showHeader
				: true,
		).toBe(false);
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

	test("folds everything before the terminal model message with an exact summary", () => {
		sharedCache = createTranscriptSectionCache();
		const turn = source("turn-fold", 0, foldBody("turn-fold"));
		const collapsed = model([turn], "request", revision, {
			expandedTurnIds: new Set(),
			protectedTurnIds: new Set(),
		});
		const fold = collapsed.rows.find((row) => row.kind === "turn-fold");
		expect(fold).toMatchObject({
			expanded: false,
			hidden: {
				events: 12,
				filesEdited: 2,
				filesRead: 1,
				filesWritten: 1,
				messages: 1,
				reasoning: 1,
				skills: 1,
				subagents: 1,
			},
			id: "turn-fold:fold",
		});

		const visibleEventIds = collapsed.rows.flatMap((row) =>
			row.kind === "section" &&
			row.section.payload.traceSection.kind === "agent"
				? row.section.payload.traceSection.events.map((event) => event.id)
				: [],
		);
		expect(visibleEventIds).toEqual(["turn-fold:message:terminal"]);
		expect(
			collapsed.rows.filter(
				(row) =>
					row.kind === "section" &&
					row.section.payload.traceSection.kind === "item",
			),
		).toHaveLength(0);
	});

	test("folds an interrupted turn while leaving its interruption last", () => {
		sharedCache = createTranscriptSectionCache();
		const turn = source(
			"turn-interrupted",
			0,
			interruptedFoldBody("turn-interrupted"),
		);
		const collapsed = model([turn], "request", revision, {
			expandedTurnIds: new Set(),
			protectedTurnIds: new Set(),
		});
		expect(
			collapsed.rows.find((row) => row.kind === "turn-fold"),
		).toMatchObject({
			expanded: false,
			hidden: {
				events: 9,
				filesEdited: 2,
				filesRead: 1,
				filesWritten: 1,
				messages: 1,
				reasoning: 1,
				skills: 1,
				subagents: 1,
			},
			id: "turn-interrupted:fold",
		});

		const visibleEventIds = collapsed.rows.flatMap((row) =>
			row.kind === "section" &&
			row.section.payload.traceSection.kind === "agent"
				? row.section.payload.traceSection.events.map((event) => event.id)
				: [],
		);
		expect(visibleEventIds).toEqual([]);
		const visibleItemIds = collapsed.rows.flatMap((row) =>
			row.kind === "section" && row.section.payload.traceSection.kind === "item"
				? [row.section.payload.traceSection.item.id]
				: [],
		);
		expect(visibleItemIds).toEqual(["turn-interrupted:interruption"]);
	});

	test("folds a Codex turn-aborted system row as an interruption", () => {
		sharedCache = createTranscriptSectionCache();
		const turn = source(
			"turn-aborted",
			0,
			codexInterruptedFoldBody("turn-aborted"),
		);
		const collapsed = model([turn], "request", revision, {
			expandedTurnIds: new Set(),
			protectedTurnIds: new Set(),
		});
		expect(
			collapsed.rows.find((row) => row.kind === "turn-fold"),
		).toMatchObject({
			expanded: false,
			id: "turn-aborted:fold",
		});
		const visibleItemIds = collapsed.rows.flatMap((row) =>
			row.kind === "section" && row.section.payload.traceSection.kind === "item"
				? [row.section.payload.traceSection.item.id]
				: [],
		);
		expect(visibleItemIds).toEqual(["turn-aborted:interruption"]);
	});

	test("keeps selected turns open and preserves expanded state by turn id", () => {
		sharedCache = createTranscriptSectionCache();
		const turn = source("turn-fold", 0, foldBody("turn-fold"));
		const selected = model([turn], "request", revision, {
			expandedTurnIds: new Set(),
			protectedTurnIds: new Set(["turn-fold"]),
		});
		expect(selected.rows.some((row) => row.kind === "turn-fold")).toBe(false);

		const expanded = model([turn], "request", revision, {
			expandedTurnIds: new Set(["turn-fold"]),
			protectedTurnIds: new Set(),
		});
		expect(expanded.rows.find((row) => row.kind === "turn-fold")).toMatchObject(
			{ expanded: true },
		);
		expect(expanded.rows.filter((row) => row.kind === "section")).toHaveLength(
			selected.rows.filter((row) => row.kind === "section").length,
		);

		const prepended = model(
			[source("turn-before", 0), { ...turn, option: option("turn-fold", 1) }],
			"request",
			revision,
			{
				expandedTurnIds: new Set(["turn-fold"]),
				protectedTurnIds: new Set(),
			},
		);
		expect(
			prepended.rows.find((row) => row.id === "turn-fold:fold"),
		).toMatchObject({ expanded: true });
	});

	test("counts folded events before the per-section rendering cap", () => {
		sharedCache = createTranscriptSectionCache();
		const oversized = body("turn-fold-large", 75);
		const turnBody = {
			responseItems: [
				...oversized.responseItems,
				{
					id: "turn-fold-large:boundary",
					kind: "system" as const,
					systemType: "context" as const,
					text: "Request boundary",
					timestamp: "2026-08-16T08:31:20.000Z",
				},
				{
					events: [
						{
							content: "Terminal answer",
							id: "turn-fold-large:message:terminal",
							kind: "message" as const,
							text: "Terminal answer",
							timestamp: "2026-08-16T08:31:21.000Z",
						},
					],
					executionMode: "default" as const,
					id: "turn-fold-large:terminal-agent",
					kind: "agent" as const,
					timestamp: "2026-08-16T08:31:21.000Z",
				},
			],
			userItems: oversized.userItems,
		};
		const collapsed = model(
			[source("turn-fold-large", 0, turnBody)],
			"request",
			revision,
			{ expandedTurnIds: new Set(), protectedTurnIds: new Set() },
		);
		expect(
			collapsed.rows.find((row) => row.kind === "turn-fold"),
		).toMatchObject({ hidden: { events: 75 } });
		expect(
			collapsed.rows.some((row) => row.id === "turn-fold-large:s0:overflow"),
		).toBe(false);

		const expanded = model(
			[source("turn-fold-large", 0, turnBody)],
			"request",
			revision,
			{
				expandedTurnIds: new Set(["turn-fold-large"]),
				protectedTurnIds: new Set(),
			},
		);
		expect(
			expanded.rows.find((row) => row.kind === "section-overflow"),
		).toMatchObject({ hidden: { events: 15 } });
	});
});
