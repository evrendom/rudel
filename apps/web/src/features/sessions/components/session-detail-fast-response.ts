import {
	type SessionDetailOverview,
	SessionDetailOverviewSchema,
	SessionDetailRevisionSchema,
	type SessionDetailSubagent,
	SessionDetailSubagentSchema,
	SessionDetailTraceItemSchema,
	type SessionDetailTurn,
	SessionDetailTurnSchema,
	type SessionDetailWindow,
	SessionDetailWindowSchema,
} from "@rudel/api-routes";
import { z } from "zod";

const unknownObjectSchema = z.record(z.unknown());
const overviewSessionShape = SessionDetailOverviewSchema.shape.session.shape;
const overviewTurnPageShape = SessionDetailOverviewSchema.shape.turnPage.shape;
const overviewTurnShape = overviewTurnPageShape.items.element.shape;
const overviewSubagentShape =
	SessionDetailOverviewSchema.shape.subagents.element.shape;
const windowShape = SessionDetailWindowSchema.shape;
const windowTurnShape = SessionDetailWindowSchema.shape.turns.element.shape;

export type ParsedSessionDetailOverview = {
	overview: SessionDetailOverview;
	shapeIssueFields: readonly string[];
};

export type ParsedSessionDetailWindow = {
	shapeIssueFields: readonly string[];
	window: SessionDetailWindow;
};

export class SessionDetailFastResponseError extends Error {
	readonly shapeIssueFields: readonly string[];

	constructor(message: string, shapeIssueFields: readonly string[] = []) {
		super(message);
		this.name = "SessionDetailFastResponseError";
		this.shapeIssueFields = shapeIssueFields;
	}
}

export class SessionDetailFastRevisionMismatchError extends Error {
	readonly requestedRevision: string;
	readonly receivedRevision: string;

	constructor(requestedRevision: string, receivedRevision: string) {
		super("The session detail response used an unexpected revision.");
		this.name = "SessionDetailFastRevisionMismatchError";
		this.requestedRevision = requestedRevision;
		this.receivedRevision = receivedRevision;
	}
}

export function parseSessionDetailOverviewResponse(
	value: unknown,
	requestedSessionId: string,
): ParsedSessionDetailOverview {
	const contractResult = SessionDetailOverviewSchema.safeParse(value);
	if (contractResult.success) {
		return { overview: contractResult.data, shapeIssueFields: [] };
	}

	const rawResult = unknownObjectSchema.safeParse(value);
	if (!rawResult.success) {
		throw responseError("overview", contractResult.error.issues);
	}
	const raw = rawResult.data;
	const revisionResult = SessionDetailRevisionSchema.safeParse(raw.revision);
	if (!revisionResult.success) {
		throw responseError("overview", contractResult.error.issues);
	}
	const issueFields = getShapeIssueFields(contractResult.error.issues);
	const session = normalizeOverviewSession(
		unknownObject(raw.session),
		requestedSessionId,
		revisionResult.data,
	);
	const turnPage = normalizeOverviewTurnPage(unknownObject(raw.turnPage));
	const subagents = Array.isArray(raw.subagents)
		? raw.subagents.flatMap((item) => {
				const normalized = normalizeOverviewSubagent(unknownObject(item));
				return normalized ? [normalized] : [];
			})
		: [];
	const overview = SessionDetailOverviewSchema.parse({
		revision: revisionResult.data,
		session,
		subagents,
		turnPage,
	});
	return { overview, shapeIssueFields: issueFields };
}

export function parseSessionDetailWindowResponse(
	value: unknown,
): ParsedSessionDetailWindow {
	const contractResult = SessionDetailWindowSchema.safeParse(value);
	if (contractResult.success) {
		return { shapeIssueFields: [], window: contractResult.data };
	}
	const rawResult = unknownObjectSchema.safeParse(value);
	if (!rawResult.success) {
		throw responseError("window", contractResult.error.issues);
	}
	const raw = rawResult.data;
	const revision = requiredField(
		SessionDetailRevisionSchema,
		raw.revision,
		"revision",
	);
	const turns = Array.isArray(raw.turns)
		? raw.turns.flatMap((turn) => {
				const normalized = normalizeWindowTurn(unknownObject(turn));
				return normalized ? [normalized] : [];
			})
		: [];
	const window = SessionDetailWindowSchema.parse({
		newerCursor: optionalField(windowShape.newerCursor, raw.newerCursor, null),
		olderCursor: optionalField(windowShape.olderCursor, raw.olderCursor, null),
		revision,
		total: optionalField(windowShape.total, raw.total, turns.length),
		turns,
	});
	return {
		shapeIssueFields: getShapeIssueFields(contractResult.error.issues),
		window,
	};
}

export function parseSessionDetailTurnResponse(
	value: unknown,
	input: { turnId: string },
): SessionDetailTurn {
	const contractResult = SessionDetailTurnSchema.safeParse(value);
	if (contractResult.success) {
		if (contractResult.data.turnId !== input.turnId) {
			throw new SessionDetailFastResponseError(
				"The session detail turn response used an unexpected identifier.",
				["turnId"],
			);
		}
		return contractResult.data;
	}

	const raw = unknownObject(value);
	const revision = requiredField(
		SessionDetailRevisionSchema,
		raw.revision,
		"revision",
	);
	const turnId = requiredField(z.string().min(1), raw.turnId, "turnId");
	if (turnId !== input.turnId) {
		throw new SessionDetailFastResponseError(
			"The session detail turn response used an unexpected identifier.",
			["turnId"],
		);
	}
	const userItems = normalizeTraceItems(raw.userItems);
	const responseItems = normalizeTraceItems(raw.responseItems);
	const normalized = SessionDetailTurnSchema.parse({
		responseItems,
		revision,
		turnId,
		userItems,
	});
	logRecoveredSessionDetailShape(
		"turn",
		input.turnId,
		getShapeIssueFields(contractResult.error.issues),
	);
	return normalized;
}

export function parseSessionDetailSubagentResponse(
	value: unknown,
	input: { subagentId: string },
): SessionDetailSubagent {
	const parsed = SessionDetailSubagentSchema.safeParse(value);
	if (!parsed.success) {
		throw responseError("subagent", parsed.error.issues);
	}
	if (parsed.data.subagentId !== input.subagentId) {
		throw new SessionDetailFastResponseError(
			"The session detail subagent response used an unexpected identifier.",
			["subagentId"],
		);
	}
	return parsed.data;
}

export function assertExpectedSessionDetailRevision(
	expectedRevision: string | undefined,
	receivedRevision: string,
) {
	if (expectedRevision && expectedRevision !== receivedRevision) {
		throw new SessionDetailFastRevisionMismatchError(
			expectedRevision,
			receivedRevision,
		);
	}
}

export function logRecoveredSessionDetailShape(
	scope: string,
	identity: string,
	fields: readonly string[],
) {
	if (fields.length === 0) {
		return;
	}
	console.warn("[SessionDetailView] Recovered a drifted fast-path response", {
		fields,
		identity,
		scope,
	});
}

function normalizeOverviewSession(
	raw: Record<string, unknown>,
	requestedSessionId: string,
	revision: string,
) {
	return {
		durationMinutes: optionalField(
			overviewSessionShape.durationMinutes,
			raw.durationMinutes,
			null,
		),
		estimatedCost: optionalField(
			overviewSessionShape.estimatedCost,
			raw.estimatedCost,
			null,
		),
		gitBranch: optionalField(
			overviewSessionShape.gitBranch,
			raw.gitBranch,
			null,
		),
		gitSha: optionalField(overviewSessionShape.gitSha, raw.gitSha, null),
		inputTokens: optionalField(
			overviewSessionShape.inputTokens,
			raw.inputTokens,
			0,
		),
		lastInteractionDate: optionalField(
			overviewSessionShape.lastInteractionDate,
			raw.lastInteractionDate,
			revision,
		),
		modelUsed: optionalField(
			overviewSessionShape.modelUsed,
			raw.modelUsed,
			null,
		),
		outputTokens: optionalField(
			overviewSessionShape.outputTokens,
			raw.outputTokens,
			0,
		),
		projectPath: optionalField(
			overviewSessionShape.projectPath,
			raw.projectPath,
			"",
		),
		repository: optionalField(
			overviewSessionShape.repository,
			raw.repository,
			null,
		),
		sessionDate: optionalField(
			overviewSessionShape.sessionDate,
			raw.sessionDate,
			revision,
		),
		sessionId: optionalField(
			overviewSessionShape.sessionId,
			raw.sessionId,
			requestedSessionId,
		),
		skills: optionalField(overviewSessionShape.skills, raw.skills, []),
		slashCommands: optionalField(
			overviewSessionShape.slashCommands,
			raw.slashCommands,
			[],
		),
		source: optionalField(overviewSessionShape.source, raw.source, null),
		totalInteractions: optionalField(
			overviewSessionShape.totalInteractions,
			raw.totalInteractions,
			null,
		),
		totalTokens: optionalField(
			overviewSessionShape.totalTokens,
			raw.totalTokens,
			0,
		),
		userId: optionalField(
			overviewSessionShape.userId,
			raw.userId,
			"unknown-user",
		),
	};
}

function normalizeOverviewTurnPage(raw: Record<string, unknown>) {
	const items = Array.isArray(raw.items)
		? raw.items.flatMap((item) => {
				const normalized = normalizeOverviewTurn(unknownObject(item));
				return normalized ? [normalized] : [];
			})
		: [];
	return {
		items,
		nextCursor: optionalField(
			overviewTurnPageShape.nextCursor,
			raw.nextCursor,
			null,
		),
		total: optionalField(overviewTurnPageShape.total, raw.total, items.length),
	};
}

function normalizeOverviewTurn(raw: Record<string, unknown>) {
	const turnIdResult = overviewTurnShape.turnId.safeParse(raw.turnId);
	const indexResult = overviewTurnShape.index.safeParse(raw.index);
	if (!turnIdResult.success || !indexResult.success) {
		return undefined;
	}
	return {
		activityResolution: optionalField(
			overviewTurnShape.activityResolution,
			raw.activityResolution,
			"exact",
		),
		durationSeconds: optionalField(
			overviewTurnShape.durationSeconds,
			raw.durationSeconds,
			null,
		),
		editedFiles: optionalField(
			overviewTurnShape.editedFiles,
			raw.editedFiles,
			[],
		),
		endedAt: optionalField(overviewTurnShape.endedAt, raw.endedAt, null),
		errorCount: optionalField(overviewTurnShape.errorCount, raw.errorCount, 0),
		errorEvents: optionalField(
			overviewTurnShape.errorEvents,
			raw.errorEvents,
			[],
		),
		estimatedCost: optionalField(
			overviewTurnShape.estimatedCost,
			raw.estimatedCost,
			null,
		),
		hasBody: optionalField(overviewTurnShape.hasBody, raw.hasBody, false),
		index: indexResult.data,
		inputTokens: optionalField(
			overviewTurnShape.inputTokens,
			raw.inputTokens,
			null,
		),
		outputTokens: optionalField(
			overviewTurnShape.outputTokens,
			raw.outputTokens,
			null,
		),
		responsePreview: optionalField(
			overviewTurnShape.responsePreview,
			raw.responsePreview,
			null,
		),
		skills: optionalField(overviewTurnShape.skills, raw.skills, []),
		skillEvents: optionalField(
			overviewTurnShape.skillEvents,
			raw.skillEvents,
			[],
		),
		slashCommands: optionalField(
			overviewTurnShape.slashCommands,
			raw.slashCommands,
			[],
		),
		startedAt: optionalField(overviewTurnShape.startedAt, raw.startedAt, null),
		toolCallCount: optionalField(
			overviewTurnShape.toolCallCount,
			raw.toolCallCount,
			0,
		),
		turnId: turnIdResult.data,
		usageCalls: optionalField(overviewTurnShape.usageCalls, raw.usageCalls, []),
		userPreview: optionalField(
			overviewTurnShape.userPreview,
			raw.userPreview,
			null,
		),
	};
}

function normalizeWindowTurn(raw: Record<string, unknown>) {
	const summary = normalizeOverviewTurn(raw);
	if (!summary) {
		return undefined;
	}
	const rawBody = unknownObject(raw.body);
	const hasBodyObject =
		typeof raw.body === "object" &&
		raw.body !== null &&
		!Array.isArray(raw.body);
	return {
		...summary,
		body: hasBodyObject
			? {
					responseItems: normalizeTraceItems(rawBody.responseItems),
					userItems: normalizeTraceItems(rawBody.userItems),
				}
			: null,
		bodyOmitted: optionalField(
			windowTurnShape.bodyOmitted,
			raw.bodyOmitted,
			null,
		),
	};
}

function normalizeOverviewSubagent(raw: Record<string, unknown>) {
	const subagentIdResult = overviewSubagentShape.subagentId.safeParse(
		raw.subagentId,
	);
	if (!subagentIdResult.success) {
		return undefined;
	}
	return {
		estimatedCost: optionalField(
			overviewSubagentShape.estimatedCost,
			raw.estimatedCost,
			null,
		),
		hasTranscript: optionalField(
			overviewSubagentShape.hasTranscript,
			raw.hasTranscript,
			false,
		),
		model: optionalField(overviewSubagentShape.model, raw.model, null),
		subagentId: subagentIdResult.data,
		totalTokens: optionalField(
			overviewSubagentShape.totalTokens,
			raw.totalTokens,
			null,
		),
	};
}

function normalizeTraceItems(value: unknown) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((item) => {
		const result = SessionDetailTraceItemSchema.safeParse(item);
		return result.success ? [result.data] : [];
	});
}

function unknownObject(value: unknown) {
	const result = unknownObjectSchema.safeParse(value);
	return result.success ? result.data : {};
}

function optionalField<TValue>(
	schema: z.ZodType<TValue>,
	value: unknown,
	fallback: TValue,
) {
	const result = schema.safeParse(value);
	return result.success ? result.data : fallback;
}

function requiredField<TValue>(
	schema: z.ZodType<TValue>,
	value: unknown,
	field: string,
) {
	const result = schema.safeParse(value);
	if (!result.success) {
		throw new SessionDetailFastResponseError(
			"The session detail response omitted a required identity field.",
			[field],
		);
	}
	return result.data;
}

function responseError(scope: string, issues: readonly z.ZodIssue[]) {
	return new SessionDetailFastResponseError(
		`The session detail ${scope} response did not match its contract.`,
		getShapeIssueFields(issues),
	);
}

function getShapeIssueFields(issues: readonly z.ZodIssue[]) {
	return [
		...new Set(
			issues.map((issue) =>
				issue.path.length > 0 ? issue.path.join(".") : "response",
			),
		),
	];
}
