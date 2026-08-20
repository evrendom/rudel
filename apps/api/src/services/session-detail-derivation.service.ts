import {
	buildConversationTrace,
	extractSessionCompactionMetadata,
	extractSessionTurnMetricBreakdown,
	getSessionTurnId,
	getSessionTurnMemberCharacterCount,
	getSessionTurnMemberText,
	getSessionTurnPreview,
	getSessionTurnTiming,
	groupTraceIntoTurns,
	parseConversations,
	parseSlashCommand,
	resolveRepoIdentity,
	SESSION_DETAIL_ACTIVITY_DETAIL_CODE_POINT_LIMIT,
	SESSION_DETAIL_ACTIVITY_POINT_LIMIT,
	SESSION_DETAIL_CONTEXT_ERROR_LIMIT,
	SESSION_DETAIL_CONTEXT_FILE_LIMIT,
	SESSION_DETAIL_PREVIEW_CODE_POINT_LIMIT,
	SESSION_DETAIL_SIGNAL_OCCURRENCE_LIMIT,
	SESSION_DETAIL_WINDOW_INITIAL_TURNS,
	SESSION_DETAIL_WINDOW_MAX_RAW_BYTES,
	SESSION_DETAIL_WINDOW_MAX_TURN_BYTES,
	SESSION_DETAIL_WINDOW_PAGE_TURNS,
	type SessionDetailOverview,
	type SessionDetailSpine,
	type SessionDetailSubagent,
	type SessionDetailTurn,
	type SessionDetailTurnBody,
	SessionDetailTurnSchema,
	type SessionDetailWindow,
	type SessionDetailWindowRequest,
	type SessionDetailWindowTurn,
	type SessionRequestCostEntry,
	type SessionTurn,
	type SessionTurnMetrics,
	type Source,
	sumSessionRequestCosts,
	type TokenUsageEvent,
	type TraceItem,
} from "@rudel/api-routes";
import {
	SCAN_VERSION,
	scanMemberLanguageSignals,
	scanModelLanguageSignalSegments,
} from "@rudel/language-signals";

export const SESSION_DETAIL_OVERVIEW_MAX_BYTES = 250 * 1024;
const SESSION_DETAIL_OVERVIEW_TARGET_BYTES = 248 * 1024;
const CURSOR_VERSION = 1;
const WINDOW_CURSOR_VERSION = 1;

export interface SessionDetailRawSnapshot {
	content: string;
	durationMinutes: number | null;
	gitBranch: string | null;
	gitRemote: string;
	gitSha: string | null;
	inputTokens: number;
	lastInteractionDate: string;
	modelUsed: string;
	organizationId: string;
	outputTokens: number;
	ownerId: string;
	packageName: string;
	projectPath: string;
	revision: string;
	sessionDate: string;
	sessionId: string;
	skills: string[];
	slashCommands: string[];
	source: Source;
	subagents: Record<string, string>;
	totalTokens: number;
}

type TurnSummary = SessionDetailOverview["turnPage"]["items"][number];
type SessionDetailActivityTotals = SessionDetailOverview["activityTotals"];
type TurnFileEvent = NonNullable<TurnSummary["fileEvents"]>[number];
type TurnSubagentEvent = NonNullable<TurnSummary["subagentEvents"]>[number];
type SessionDetailContext = SessionDetailOverview["context"];
type SessionDetailContextFile = SessionDetailContext["files"][number];

export interface SessionDetailDerivation {
	byteSize: number;
	overviewBase: Omit<SessionDetailOverview, "turnPage">;
	rawSubagents: Readonly<Record<string, string>>;
	revision: string;
	spine: SessionDetailSpine["turns"];
	turnBodies: ReadonlyMap<string, SessionDetailTurn>;
	turnSummaries: readonly TurnSummary[];
}

type TurnCursor = {
	offset: number;
	revision: string;
	version: typeof CURSOR_VERSION;
};

interface SessionDetailWindowCursor {
	direction: "older" | "newer";
	revision: string;
	turnId: string;
	version: typeof WINDOW_CURSOR_VERSION;
}

export interface SessionDetailWindowAssembly {
	oversizedTurns: number;
	serializedBytes: number;
	truncatedByBudget: boolean;
	window: SessionDetailWindow;
}

export class InvalidSessionDetailCursorError extends Error {
	constructor() {
		super("The session detail turn cursor is invalid");
		this.name = "InvalidSessionDetailCursorError";
	}
}

export class StaleSessionDetailCursorError extends Error {
	constructor(
		readonly requestedRevision: string,
		readonly currentRevision: string,
	) {
		super("The session detail turn cursor belongs to another revision");
		this.name = "StaleSessionDetailCursorError";
	}
}

export class InvalidSessionDetailWindowCursorError extends Error {
	constructor() {
		super("The session detail window cursor is invalid");
		this.name = "InvalidSessionDetailWindowCursorError";
	}
}

export class SessionDetailAnchorNotFoundError extends Error {
	constructor(
		readonly turnId: string,
		readonly revision: string,
	) {
		super("The requested session detail turn does not exist");
		this.name = "SessionDetailAnchorNotFoundError";
	}
}

function serializedBytes(value: unknown) {
	return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function truncateSessionDetailPreview(value: string) {
	const normalized = value.replace(/\s+/gu, " ").trim();
	if (!normalized) {
		return null;
	}
	const codePoints = Array.from(normalized);
	if (codePoints.length <= SESSION_DETAIL_PREVIEW_CODE_POINT_LIMIT) {
		return normalized;
	}
	return `${codePoints
		.slice(0, SESSION_DETAIL_PREVIEW_CODE_POINT_LIMIT - 3)
		.join("")
		.trimEnd()}...`;
}

function truncateSessionDetailActivityDetail(value: string | undefined) {
	const normalized = value?.trim();
	if (!normalized) {
		return undefined;
	}
	const codePoints = Array.from(normalized);
	if (codePoints.length <= SESSION_DETAIL_ACTIVITY_DETAIL_CODE_POINT_LIMIT) {
		return normalized;
	}
	return `${codePoints
		.slice(0, SESSION_DETAIL_ACTIVITY_DETAIL_CODE_POINT_LIMIT - 3)
		.join("")
		.trimEnd()}...`;
}

function countToolCalls(items: readonly TraceItem[]) {
	return items.reduce(
		(total, item) =>
			total +
			(item.kind === "agent"
				? item.events.filter((event) => event.kind === "tool").length
				: 0),
		0,
	);
}

function countResponseEvents(items: readonly TraceItem[]) {
	return items.reduce(
		(total, item) => total + (item.kind === "agent" ? item.events.length : 1),
		0,
	);
}

function getTurnSlashCommands(turn: SessionTurn) {
	return turn.userItems.flatMap((item) => {
		if (item.kind !== "user") {
			return [];
		}
		const parsed = parseSlashCommand(item.content);
		return parsed?.commandName ? [parsed.commandName] : [];
	});
}

function bucketByIndex<Value>(values: readonly Value[], limit: number) {
	if (values.length <= limit) {
		return values.map((value) => [value]);
	}
	const buckets: Value[][] = [];
	for (let index = 0; index < limit; index++) {
		const start = Math.floor((index * values.length) / limit);
		const end = Math.floor(((index + 1) * values.length) / limit);
		buckets.push(values.slice(start, end));
	}
	return buckets;
}

export function bucketSessionDetailUsageCalls(
	usageEvents: readonly TokenUsageEvent[],
	limit = SESSION_DETAIL_ACTIVITY_POINT_LIMIT,
): TurnSummary["usageCalls"] {
	return bucketByIndex(usageEvents, limit).flatMap((bucket) => {
		const first = bucket[0];
		if (!first) {
			return [];
		}
		const model = bucket.every((event) => event.model === first.model)
			? first.model
			: undefined;
		const contextWindows = bucket.flatMap((event) =>
			event.modelContextWindow === undefined ? [] : [event.modelContextWindow],
		);
		return [
			{
				at: first.at,
				cacheCreationInputTokens: bucket.reduce(
					(total, event) => total + event.cacheCreationInputTokens,
					0,
				),
				cacheReadInputTokens: bucket.reduce(
					(total, event) => total + event.cacheReadInputTokens,
					0,
				),
				contextWindow:
					contextWindows.length > 0 ? Math.max(...contextWindows) : null,
				freshInputTokens: bucket.reduce(
					(total, event) => total + event.inputTokens,
					0,
				),
				model: model ?? null,
				outputTokens: bucket.reduce(
					(total, event) => total + event.outputTokens,
					0,
				),
			},
		];
	});
}

function isSubagentLaunchTool(toolName: string) {
	const normalizedName = toolName.split(/\.|__/u).at(-1)?.toLowerCase();
	return (
		normalizedName === "agent" ||
		normalizedName === "task" ||
		normalizedName === "spawn_agent"
	);
}

function collectTurnActivityEvents(turn: SessionTurn) {
	const fileEvents: TurnFileEvent[] = [];
	const fileEventKeys = new Set<string>();
	const subagentEvents: TurnSubagentEvent[] = [];

	for (const item of turn.responseItems) {
		if (item.kind !== "agent") {
			continue;
		}
		for (const event of item.events) {
			if (event.kind !== "tool" || event.result?.isError === true) {
				continue;
			}

			for (const file of getToolFileActivities(event.toolName, event.input)) {
				const eventKey = `${event.id}\0${file.operation}\0${file.path}`;
				if (fileEventKeys.has(eventKey)) {
					continue;
				}
				fileEventKeys.add(eventKey);
				fileEvents.push({
					at: event.timestamp,
					count: 1,
					eventId: event.id,
					operation: file.operation,
					path: file.path,
				});
			}

			if (isSubagentLaunchTool(event.toolName)) {
				const subagentId = event.result?.subagentId;
				subagentEvents.push({
					at: event.timestamp,
					count: 1,
					eventId: event.id,
					...(subagentId ? { subagentId } : {}),
				});
			}
		}
	}

	return { fileEvents, subagentEvents };
}

function bucketSessionDetailFileEvents(
	fileEvents: readonly TurnFileEvent[],
	limit: number,
): TurnFileEvent[] {
	if (fileEvents.length <= limit) {
		return [...fileEvents];
	}
	if (limit <= 0) {
		return [];
	}

	const groupedEvents = new Map<TurnFileEvent["operation"], TurnFileEvent[]>();
	for (const event of fileEvents) {
		const group = groupedEvents.get(event.operation) ?? [];
		group.push(event);
		groupedEvents.set(event.operation, group);
	}

	const groups = [...groupedEvents.values()];
	let remainingSlots = limit;
	return groups.flatMap((group, groupIndex) => {
		const remainingGroups = groups.length - groupIndex;
		const groupLimit = Math.max(
			1,
			Math.floor(remainingSlots / remainingGroups),
		);
		remainingSlots -= groupLimit;
		return bucketByIndex(group, groupLimit).flatMap((bucket) => {
			const first = bucket[0];
			const eventIds = new Set(bucket.map((event) => event.eventId));
			const paths = new Set(bucket.map((event) => event.path));
			return first
				? [
						{
							...first,
							count: bucket.reduce((total, event) => total + event.count, 0),
							eventId: eventIds.size === 1 ? first.eventId : undefined,
							path: paths.size === 1 ? first.path : undefined,
						},
					]
				: [];
		});
	});
}

function bucketSessionDetailSubagentEvents(
	subagentEvents: readonly TurnSubagentEvent[],
	limit: number,
): TurnSubagentEvent[] {
	return bucketByIndex(subagentEvents, limit).flatMap((bucket) => {
		const first = bucket[0];
		const eventIds = new Set(bucket.map((event) => event.eventId));
		const subagentIds = new Set(bucket.map((event) => event.subagentId));
		return first
			? [
					{
						...first,
						count: bucket.reduce((total, event) => total + event.count, 0),
						eventId: eventIds.size === 1 ? first.eventId : undefined,
						subagentId: subagentIds.size === 1 ? first.subagentId : undefined,
					},
				]
			: [];
	});
}

function createActivitySummary(
	metrics: SessionTurnMetrics,
	fileEvents: readonly TurnFileEvent[],
	subagentEvents: readonly TurnSubagentEvent[],
	limit: number,
) {
	const usageCalls = bucketSessionDetailUsageCalls(metrics.usageEvents, limit);
	const errorEvents = bucketByIndex(metrics.errorEvents, limit).flatMap(
		(bucket) => {
			const first = bucket[0];
			if (!first) {
				return [];
			}
			const contents = [
				...new Set(
					bucket.flatMap((event) =>
						event.content === undefined ? [] : [event.content],
					),
				),
			];
			const content = truncateSessionDetailActivityDetail(
				contents.join("\n\n"),
			);
			return [{ at: first.at, ...(content ? { content } : {}) }];
		},
	);
	const skillEvents = bucketByIndex(metrics.skillEvents, limit).flatMap(
		(bucket) => (bucket[0] ? [{ ...bucket[0] }] : []),
	);
	const summarizedFileEvents = bucketSessionDetailFileEvents(fileEvents, limit);
	const summarizedSubagentEvents = bucketSessionDetailSubagentEvents(
		subagentEvents,
		limit,
	);
	return {
		activityResolution:
			usageCalls.length < metrics.usageEvents.length ||
			errorEvents.length < metrics.errorEvents.length ||
			skillEvents.length < metrics.skillEvents.length ||
			summarizedFileEvents.length < fileEvents.length ||
			summarizedSubagentEvents.length < subagentEvents.length
				? ("bucketed" as const)
				: ("exact" as const),
		errorEvents,
		fileEvents: summarizedFileEvents,
		skillEvents,
		subagentEvents: summarizedSubagentEvents,
		usageCalls,
	};
}

function createTurnSummary(
	turn: SessionTurn,
	metrics: SessionTurnMetrics,
	index: number,
	activityLimit = SESSION_DETAIL_ACTIVITY_POINT_LIMIT,
): TurnSummary {
	const timing = getSessionTurnTiming(turn);
	const { fileEvents, subagentEvents } = collectTurnActivityEvents(turn);
	const allSignalOccurrences = scanMemberLanguageSignals(
		getSessionTurnMemberText(turn),
	).flatMap((signal) =>
		signal.category === "swear"
			? []
			: [{ category: signal.category, matchedText: signal.matchedText }],
	);
	const signalOccurrences = allSignalOccurrences.slice(
		0,
		SESSION_DETAIL_SIGNAL_OCCURRENCE_LIMIT,
	);
	const signalOccurrencesOmittedCount =
		allSignalOccurrences.length - signalOccurrences.length;
	const modelSignalCount = scanModelLanguageSignalSegments(
		getTurnModelMessageSegments(turn),
	).filter((signal) => signal.category !== "swear").length;
	return {
		...createActivitySummary(
			metrics,
			fileEvents,
			subagentEvents,
			activityLimit,
		),
		durationSeconds: timing.durationSeconds ?? null,
		editedFiles: [...metrics.editedFiles],
		endedAt: timing.endTimestamp ?? null,
		errorCount: metrics.errorCount,
		estimatedCost: metrics.estimatedCost ?? null,
		hasBody: turn.userItems.length + turn.responseItems.length > 0,
		index,
		inputTokens: metrics.inputTokens ?? null,
		modelSignalCount,
		outputTokens: metrics.outputTokens ?? null,
		responsePreview: truncateSessionDetailPreview(getSessionTurnPreview(turn)),
		signalCount: signalOccurrences.length,
		signalOccurrences,
		signalOccurrencesOmittedCount,
		signalOccurrencesTruncated: signalOccurrencesOmittedCount > 0,
		skills: [...metrics.skills],
		skillCount:
			metrics.skillEvents.length > 0
				? metrics.skillEvents.length
				: metrics.skills.length,
		slashCommands: getTurnSlashCommands(turn),
		startedAt: timing.startTimestamp ?? null,
		toolCallCount: countToolCalls(turn.responseItems),
		turnId: getSessionTurnId(turn),
		userCharacterCount: getSessionTurnMemberCharacterCount(turn),
		userPreview: truncateSessionDetailPreview(getSessionTurnMemberText(turn)),
	};
}

function getTurnModelMessageSegments(turn: SessionTurn): string[] {
	return turn.responseItems.flatMap((item) =>
		item.kind === "agent"
			? item.events.flatMap((event) =>
					event.kind === "message" ? [event.text] : [],
				)
			: [],
	);
}

function buildSessionDetailActivityTotals(
	turnSummaries: readonly TurnSummary[],
): SessionDetailActivityTotals {
	const totals: SessionDetailActivityTotals = {
		edit: 0,
		error: 0,
		read: 0,
		signal: 0,
		signalScanVersion: SCAN_VERSION,
		skill: 0,
		subagent: 0,
		write: 0,
	};

	for (const summary of turnSummaries) {
		totals.error += summary.errorCount;
		totals.signal += summary.signalCount;
		totals.skill += summary.skillCount;
		for (const event of summary.fileEvents ?? []) {
			switch (event.operation) {
				case "created":
					totals.write += event.count;
					break;
				case "edited":
					totals.edit += event.count;
					break;
				case "read":
					totals.read += event.count;
					break;
			}
		}
		for (const event of summary.subagentEvents ?? []) {
			totals.subagent += event.count;
		}
	}

	return totals;
}

function getSessionCostEntries(
	turnMetrics: readonly SessionTurnMetrics[],
	subagentMetrics: readonly SessionTurnMetrics[],
): SessionRequestCostEntry[] {
	return [...turnMetrics, ...subagentMetrics].map((metrics) => ({
		estimatedCost: metrics.estimatedCost ?? null,
		usageEventCount: metrics.usageEvents.length,
	}));
}

function unique(values: readonly string[]) {
	return [...new Set(values)];
}

function getToolInputString(
	input: Readonly<Record<string, unknown>>,
	keys: readonly string[],
) {
	for (const key of keys) {
		const value = input[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return undefined;
}

function getApplyPatchFiles(
	input: Readonly<Record<string, unknown>>,
): SessionDetailContextFile[] {
	const patch = getToolInputString(input, ["input", "patch", "arguments"]);
	if (!patch) {
		return [];
	}

	return Array.from(
		patch.matchAll(/^\*\*\* (Add|Delete|Update) File: (.+)$/gmu),
	).flatMap((match) => {
		const directive = match[1];
		const path = match[2]?.trim();
		if (!path) {
			return [];
		}
		return [
			{
				operation: directive === "Add" ? "created" : "edited",
				path,
			},
		];
	});
}

function getToolFileActivities(
	toolName: string,
	input: Readonly<Record<string, unknown>>,
): SessionDetailContextFile[] {
	const normalizedName = toolName.split(".").at(-1)?.toLowerCase();
	if (normalizedName === "apply_patch") {
		return getApplyPatchFiles(input);
	}

	const path = getToolInputString(input, [
		"file_path",
		"notebook_path",
		"path",
	]);
	if (!path) {
		return [];
	}

	if (normalizedName === "read" || normalizedName === "view_image") {
		return [{ operation: "read", path }];
	}
	if (normalizedName === "write") {
		return [{ operation: "created", path }];
	}
	if (
		normalizedName === "edit" ||
		normalizedName === "multiedit" ||
		normalizedName === "notebookedit"
	) {
		return [{ operation: "edited", path }];
	}

	return [];
}

function collectSessionDetailContext(
	trace: readonly TraceItem[],
	turnMetrics: readonly SessionTurnMetrics[],
): SessionDetailContext {
	const files: SessionDetailContextFile[] = [];
	const fileKeys = new Set<string>();
	const errorCounts = new Map<string, number>();

	function addFile(file: SessionDetailContextFile) {
		const key = `${file.operation}\0${file.path}`;
		if (
			fileKeys.has(key) ||
			files.length >= SESSION_DETAIL_CONTEXT_FILE_LIMIT
		) {
			return;
		}
		fileKeys.add(key);
		files.push(file);
	}

	function addError(label: string, count = 1) {
		const normalizedLabel = label.trim() || "Other";
		errorCounts.set(
			normalizedLabel,
			(errorCounts.get(normalizedLabel) ?? 0) + count,
		);
	}

	for (const item of trace) {
		if (item.kind !== "agent") {
			continue;
		}
		for (const event of item.events) {
			if (event.kind === "tool") {
				if (event.result?.isError === true) {
					addError(event.toolName);
					continue;
				}
				for (const file of getToolFileActivities(event.toolName, event.input)) {
					addFile(file);
				}
				continue;
			}
			if (event.kind === "orphan-result" && event.result.isError) {
				addError("Tool result");
			}
		}
	}

	for (const path of unique(
		turnMetrics.flatMap((metrics) => metrics.editedFiles),
	)) {
		if (fileKeys.has(`created\0${path}`)) {
			continue;
		}
		addFile({ operation: "edited", path });
	}

	const recordedErrorCount = turnMetrics.reduce(
		(total, metrics) => total + metrics.errorCount,
		0,
	);
	const identifiedErrorCount = Array.from(errorCounts.values()).reduce(
		(total, count) => total + count,
		0,
	);
	if (recordedErrorCount > identifiedErrorCount) {
		addError("Other", recordedErrorCount - identifiedErrorCount);
	}

	return {
		errors: Array.from(errorCounts, ([label, count]) => ({
			count,
			label,
		})).slice(0, SESSION_DETAIL_CONTEXT_ERROR_LIMIT),
		files,
	};
}

export function deriveSessionDetail(
	snapshot: SessionDetailRawSnapshot,
): SessionDetailDerivation {
	const compactionMetadata = extractSessionCompactionMetadata(snapshot.content);
	const trace = buildConversationTrace(
		parseConversations(snapshot.content),
	).filter((item) => !compactionMetadata.hiddenTraceItemIds.has(item.id));
	const turns = groupTraceIntoTurns(trace);
	const {
		primaryTurnMetrics,
		subagentMetrics: extractedSubagentMetrics,
		turnMetrics,
	} = extractSessionTurnMetricBreakdown(snapshot.content, {
		fallbackModel: snapshot.modelUsed || undefined,
		subagents: snapshot.subagents,
		turns,
	});
	const subagentMetrics = extractedSubagentMetrics.map(
		({ metrics, subagentId }) => ({
			content: snapshot.subagents[subagentId] ?? "",
			metrics,
			subagentId,
		}),
	);
	const turnSummaries = turns.map((turn, index) =>
		createTurnSummary(
			turn,
			turnMetrics[index] ?? {
				editedFiles: [],
				errorCount: 0,
				errorEvents: [],
				estimatedCost: undefined,
				inputTokens: undefined,
				outputTokens: undefined,
				skills: [],
				skillEvents: [],
				usageEvents: [],
			},
			index,
		),
	);
	const turnBodies = new Map<string, SessionDetailTurn>(
		turns.map((turn) => {
			const turnId = getSessionTurnId(turn);
			return [
				turnId,
				SessionDetailTurnSchema.parse({
					responseItems: turn.responseItems,
					revision: snapshot.revision,
					turnId,
					userItems: turn.userItems,
				}),
			] as const;
		}),
	);
	const spine: SessionDetailSpine["turns"] = turns.map((turn) => ({
		eventCount: countResponseEvents(turn.responseItems),
		responseBytes: serializedBytes(turn.responseItems),
		turnId: getSessionTurnId(turn),
	}));
	const repository = resolveRepoIdentity({
		gitRemote: snapshot.gitRemote || null,
		packageName: snapshot.packageName || null,
		projectPath: snapshot.projectPath,
	}).repoLabel;
	const overviewBase: Omit<SessionDetailOverview, "turnPage"> = {
		activityTotals: buildSessionDetailActivityTotals(turnSummaries),
		context: collectSessionDetailContext(trace, turnMetrics),
		revision: snapshot.revision,
		session: {
			durationMinutes: snapshot.durationMinutes,
			estimatedCost: sumSessionRequestCosts(
				getSessionCostEntries(
					primaryTurnMetrics,
					subagentMetrics.map((entry) => entry.metrics),
				),
			),
			gitBranch: snapshot.gitBranch,
			gitSha: snapshot.gitSha,
			inputTokens: snapshot.inputTokens,
			lastInteractionDate: snapshot.lastInteractionDate,
			modelUsed: snapshot.modelUsed || null,
			outputTokens: snapshot.outputTokens,
			projectPath: snapshot.projectPath,
			repository: repository || null,
			sessionDate: snapshot.sessionDate,
			sessionId: snapshot.sessionId,
			skills: unique(snapshot.skills),
			slashCommands: unique(snapshot.slashCommands),
			source: snapshot.source,
			totalTokens: snapshot.totalTokens,
			userId: snapshot.ownerId,
		},
		subagents: subagentMetrics.map(({ content, metrics, subagentId }) => {
			let model: string | undefined;
			for (let index = metrics.usageEvents.length - 1; index >= 0; index--) {
				model = metrics.usageEvents[index]?.model;
				if (model) {
					break;
				}
			}
			return {
				estimatedCost: metrics.estimatedCost ?? null,
				hasTranscript: content.length > 0,
				inputTokens: metrics.inputTokens ?? null,
				model: model ?? null,
				outputTokens: metrics.outputTokens ?? null,
				subagentId,
				totalTokens:
					metrics.inputTokens === undefined &&
					metrics.outputTokens === undefined
						? null
						: (metrics.inputTokens ?? 0) + (metrics.outputTokens ?? 0),
			};
		}),
	};
	const derivedBytes = serializedBytes({
		overviewBase,
		spine,
		turnBodies: [...turnBodies.values()],
		turnSummaries,
	});
	const rawBytes =
		Buffer.byteLength(snapshot.content, "utf8") +
		Object.entries(snapshot.subagents).reduce(
			(total, [id, content]) =>
				total +
				Buffer.byteLength(id, "utf8") +
				Buffer.byteLength(content, "utf8"),
			0,
		);

	return {
		byteSize: rawBytes + derivedBytes,
		overviewBase,
		rawSubagents: snapshot.subagents,
		revision: snapshot.revision,
		spine,
		turnBodies,
		turnSummaries,
	};
}

export function getSessionDetailSpine(
	derivation: SessionDetailDerivation,
): SessionDetailSpine {
	return { revision: derivation.revision, turns: derivation.spine };
}

export function encodeSessionDetailTurnCursor(cursor: TurnCursor) {
	return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSessionDetailTurnCursor(value: string): TurnCursor {
	try {
		const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			parsed.version !== CURSOR_VERSION ||
			typeof parsed.revision !== "string" ||
			!Number.isSafeInteger(parsed.offset) ||
			parsed.offset < 0
		) {
			throw new InvalidSessionDetailCursorError();
		}
		return parsed as TurnCursor;
	} catch (error) {
		if (error instanceof InvalidSessionDetailCursorError) {
			throw error;
		}
		throw new InvalidSessionDetailCursorError();
	}
}

function bucketSummaryToLimit(
	summary: TurnSummary,
	limit: number,
): TurnSummary {
	if (
		limit >= summary.usageCalls.length &&
		limit >= summary.errorEvents.length &&
		limit >= summary.skillEvents.length
	) {
		return summary;
	}
	const usageEvents: TokenUsageEvent[] = summary.usageCalls.map((event) => ({
		at: event.at,
		cacheCreationInputTokens: event.cacheCreationInputTokens,
		cacheReadInputTokens: event.cacheReadInputTokens,
		inputTokens: event.freshInputTokens,
		model: event.model ?? undefined,
		modelContextWindow: event.contextWindow ?? undefined,
		outputTokens: event.outputTokens,
	}));
	return {
		...summary,
		activityResolution: "bucketed",
		errorEvents: bucketByIndex(summary.errorEvents, limit).flatMap((bucket) =>
			bucket[0] ? [bucket[0]] : [],
		),
		skillEvents: bucketByIndex(summary.skillEvents, limit).flatMap((bucket) =>
			bucket[0] ? [bucket[0]] : [],
		),
		usageCalls: bucketSessionDetailUsageCalls(usageEvents, limit),
	};
}

export function getSessionDetailOverviewPage(input: {
	cursor?: string;
	derivation: SessionDetailDerivation;
	limit: number;
}): SessionDetailOverview {
	const { derivation } = input;
	const cursor = input.cursor
		? decodeSessionDetailTurnCursor(input.cursor)
		: { offset: 0, revision: derivation.revision, version: CURSOR_VERSION };
	if (cursor.revision !== derivation.revision) {
		throw new StaleSessionDetailCursorError(
			cursor.revision,
			derivation.revision,
		);
	}
	if (cursor.offset > derivation.turnSummaries.length) {
		throw new InvalidSessionDetailCursorError();
	}

	const selected: TurnSummary[] = [];
	let nextOffset = cursor.offset;
	while (
		nextOffset < derivation.turnSummaries.length &&
		selected.length < input.limit
	) {
		const sourceSummary = derivation.turnSummaries[nextOffset];
		if (!sourceSummary) {
			break;
		}
		let candidate = sourceSummary;
		let activityLimit = SESSION_DETAIL_ACTIVITY_POINT_LIMIT;
		while (activityLimit >= 1) {
			const pageCandidate = [...selected, candidate];
			const hasMore = nextOffset + 1 < derivation.turnSummaries.length;
			const responseCandidate = {
				...derivation.overviewBase,
				turnPage: {
					items: pageCandidate,
					nextCursor: hasMore
						? encodeSessionDetailTurnCursor({
								offset: nextOffset + 1,
								revision: derivation.revision,
								version: CURSOR_VERSION,
							})
						: null,
					total: derivation.turnSummaries.length,
				},
			};
			if (
				serializedBytes(responseCandidate) <=
				SESSION_DETAIL_OVERVIEW_TARGET_BYTES
			) {
				selected.push(candidate);
				nextOffset += 1;
				break;
			}
			if (selected.length > 0) {
				activityLimit = 0;
				break;
			}
			activityLimit = Math.floor(activityLimit / 2);
			candidate = bucketSummaryToLimit(
				sourceSummary,
				Math.max(activityLimit, 1),
			);
		}
		if (nextOffset === cursor.offset && selected.length === 0) {
			throw new Error("A session detail turn summary exceeds the byte budget");
		}
		if (
			nextOffset < derivation.turnSummaries.length &&
			selected.length > 0 &&
			activityLimit === 0
		) {
			break;
		}
	}

	const response: SessionDetailOverview = {
		...derivation.overviewBase,
		turnPage: {
			items: selected,
			nextCursor:
				nextOffset < derivation.turnSummaries.length
					? encodeSessionDetailTurnCursor({
							offset: nextOffset,
							revision: derivation.revision,
							version: CURSOR_VERSION,
						})
					: null,
			total: derivation.turnSummaries.length,
		},
	};
	if (serializedBytes(response) > SESSION_DETAIL_OVERVIEW_MAX_BYTES) {
		throw new Error(
			"Session detail overview exceeded its serialized byte ceiling",
		);
	}
	return response;
}

export function assembleSessionDetailWindow(input: {
	derivation: SessionDetailDerivation;
	request: SessionDetailWindowRequest;
}): SessionDetailWindowAssembly {
	const { derivation, request } = input;
	const candidateIndices = getWindowCandidateIndices(derivation, request);
	const selectedTurns = new Map<number, SessionDetailWindowTurn>();
	let oversizedTurns = 0;
	let truncatedByBudget = false;

	for (const index of candidateIndices) {
		const turn = createSessionDetailWindowTurn(derivation, index);
		if (!turn) {
			continue;
		}
		const nextTurns = new Map(selectedTurns);
		nextTurns.set(index, turn.value);
		const nextWindow = createSessionDetailWindowResponse(derivation, [
			...nextTurns.entries(),
		]);
		if (serializedBytes(nextWindow) > SESSION_DETAIL_WINDOW_MAX_RAW_BYTES) {
			truncatedByBudget = true;
			break;
		}
		selectedTurns.set(index, turn.value);
		if (turn.oversized) {
			oversizedTurns += 1;
		}
	}

	const window = createSessionDetailWindowResponse(derivation, [
		...selectedTurns.entries(),
	]);
	return {
		oversizedTurns,
		serializedBytes: serializedBytes(window),
		truncatedByBudget,
		window,
	};
}

export function decodeSessionDetailWindowCursor(
	cursor: string,
): SessionDetailWindowCursor {
	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		);
		if (!isSessionDetailWindowCursor(parsed)) {
			throw new InvalidSessionDetailWindowCursorError();
		}
		return parsed;
	} catch (error) {
		if (error instanceof InvalidSessionDetailWindowCursorError) {
			throw error;
		}
		throw new InvalidSessionDetailWindowCursorError();
	}
}

function getWindowCandidateIndices(
	derivation: SessionDetailDerivation,
	request: SessionDetailWindowRequest,
) {
	const total = derivation.turnSummaries.length;
	if (request.mode === "initial") {
		return Array.from(
			{ length: Math.min(total, SESSION_DETAIL_WINDOW_INITIAL_TURNS) },
			(_, index) => index,
		);
	}
	if (request.mode === "anchor") {
		if (request.revision !== derivation.revision) {
			throw new StaleSessionDetailCursorError(
				request.revision,
				derivation.revision,
			);
		}
		const anchorIndex = derivation.turnSummaries.findIndex(
			(turn) => turn.turnId === request.anchorTurnId,
		);
		if (anchorIndex < 0) {
			throw new SessionDetailAnchorNotFoundError(
				request.anchorTurnId,
				derivation.revision,
			);
		}
		return centeredWindowIndices(
			anchorIndex,
			total,
			SESSION_DETAIL_WINDOW_INITIAL_TURNS,
		);
	}

	const cursor = decodeSessionDetailWindowCursor(request.cursor);
	if (
		cursor.direction !== request.mode ||
		cursor.revision !== derivation.revision
	) {
		if (cursor.revision !== derivation.revision) {
			throw new StaleSessionDetailCursorError(
				cursor.revision,
				derivation.revision,
			);
		}
		throw new InvalidSessionDetailWindowCursorError();
	}
	const cursorIndex = derivation.turnSummaries.findIndex(
		(turn) => turn.turnId === cursor.turnId,
	);
	if (cursorIndex < 0) {
		throw new InvalidSessionDetailWindowCursorError();
	}
	if (request.mode === "older") {
		const count = Math.min(cursorIndex, SESSION_DETAIL_WINDOW_PAGE_TURNS);
		return Array.from(
			{ length: count },
			(_, offset) => cursorIndex - offset - 1,
		);
	}
	const count = Math.min(
		total - cursorIndex - 1,
		SESSION_DETAIL_WINDOW_PAGE_TURNS,
	);
	return Array.from({ length: count }, (_, offset) => cursorIndex + offset + 1);
}

function centeredWindowIndices(
	anchorIndex: number,
	total: number,
	limit: number,
) {
	const indices = [anchorIndex];
	for (let distance = 1; indices.length < limit; distance += 1) {
		const before = anchorIndex - distance;
		const after = anchorIndex + distance;
		if (before >= 0) {
			indices.push(before);
		}
		if (indices.length < limit && after < total) {
			indices.push(after);
		}
		if (before < 0 && after >= total) {
			break;
		}
	}
	return indices;
}

function createSessionDetailWindowTurn(
	derivation: SessionDetailDerivation,
	index: number,
) {
	const summary = derivation.turnSummaries[index];
	if (!summary) {
		return undefined;
	}
	const cachedTurn = derivation.turnBodies.get(summary.turnId);
	const body: SessionDetailTurnBody | null = cachedTurn
		? {
				responseItems: cachedTurn.responseItems,
				userItems: cachedTurn.userItems,
			}
		: null;
	const oversized =
		body !== null &&
		serializedBytes(body) > SESSION_DETAIL_WINDOW_MAX_TURN_BYTES;
	return {
		oversized,
		value: {
			...summary,
			body: oversized ? null : body,
			bodyOmitted: oversized ? "oversized" : null,
		} satisfies SessionDetailWindowTurn,
	};
}

function createSessionDetailWindowResponse(
	derivation: SessionDetailDerivation,
	entries: readonly (readonly [number, SessionDetailWindowTurn])[],
): SessionDetailWindow {
	const sorted = [...entries].sort(([left], [right]) => left - right);
	const first = sorted[0];
	const last = sorted.at(-1);
	return {
		newerCursor:
			last && last[0] < derivation.turnSummaries.length - 1
				? encodeSessionDetailWindowCursor({
						direction: "newer",
						revision: derivation.revision,
						turnId: last[1].turnId,
						version: WINDOW_CURSOR_VERSION,
					})
				: null,
		olderCursor:
			first && first[0] > 0
				? encodeSessionDetailWindowCursor({
						direction: "older",
						revision: derivation.revision,
						turnId: first[1].turnId,
						version: WINDOW_CURSOR_VERSION,
					})
				: null,
		revision: derivation.revision,
		total: derivation.turnSummaries.length,
		turns: sorted.map(([, turn]) => turn),
	};
}

function encodeSessionDetailWindowCursor(cursor: SessionDetailWindowCursor) {
	return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function isSessionDetailWindowCursor(
	value: unknown,
): value is SessionDetailWindowCursor {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return (
		"direction" in value &&
		(value.direction === "older" || value.direction === "newer") &&
		"revision" in value &&
		typeof value.revision === "string" &&
		"turnId" in value &&
		typeof value.turnId === "string" &&
		"version" in value &&
		value.version === WINDOW_CURSOR_VERSION
	);
}

export function getSessionDetailTurn(
	derivation: SessionDetailDerivation,
	turnId: string,
) {
	return derivation.turnBodies.get(turnId) ?? null;
}

export function getSessionDetailSubagent(
	derivation: SessionDetailDerivation,
	subagentId: string,
): SessionDetailSubagent | null {
	const content = derivation.rawSubagents[subagentId];
	return content === undefined
		? null
		: { content, revision: derivation.revision, subagentId };
}
