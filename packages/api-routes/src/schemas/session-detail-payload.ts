import type { ErrorMap } from "@orpc/contract";
import { z } from "zod";
import { SourceSchema } from "./source.js";

const MAX_SESSION_ID_LENGTH = 512;
const MAX_TURN_CURSOR_LENGTH = 4096;
const MAX_DETAIL_ITEM_ID_LENGTH = 512;
const MAX_DETAIL_STRING_LENGTH = 4096;
const MAX_DETAIL_COLLECTION_LENGTH = 512;
const MAX_TRACE_ITEM_COUNT = 100_000;
const MAX_SESSION_DETAIL_SPINE_TURNS = 100_000;
const MAX_TRANSCRIPT_CODE_UNITS = 160 * 1024 * 1024;

export const SESSION_DETAIL_TURN_PAGE_LIMIT = 100;
export const SESSION_DETAIL_WINDOW_INITIAL_TURNS = 200;
export const SESSION_DETAIL_WINDOW_PAGE_TURNS = 200;
export const SESSION_DETAIL_WINDOW_MAX_RAW_BYTES = 4 * 1024 * 1024;
export const SESSION_DETAIL_WINDOW_MAX_TURN_BYTES = 1.5 * 1024 * 1024;
export const SESSION_DETAIL_ACTIVITY_POINT_LIMIT = 512;
export const SESSION_DETAIL_ACTIVITY_DETAIL_CODE_POINT_LIMIT = 4_096;
export const SESSION_DETAIL_CONTEXT_ERROR_LIMIT = 64;
export const SESSION_DETAIL_CONTEXT_FILE_LIMIT = 128;
export const SESSION_DETAIL_PREVIEW_CODE_POINT_LIMIT = 140;
export const SESSION_DETAIL_SIGNAL_OCCURRENCE_LIMIT = 200;
export const SESSION_DETAIL_STALE_REVISION_CODE = "STALE_REVISION";
export const SESSION_DETAIL_STALE_REVISION_MESSAGE =
	"The session changed while its detail was being loaded.";
export const SESSION_DETAIL_ANCHOR_NOT_FOUND_CODE = "ANCHOR_NOT_FOUND";
export const SESSION_DETAIL_ANCHOR_NOT_FOUND_MESSAGE =
	"The requested turn does not exist in this session revision.";

export const SessionDetailRevisionSchema = z
	.string()
	.datetime({ offset: true });
export const SessionDetailWindowCursorSchema = z
	.string()
	.min(1)
	.max(MAX_TURN_CURSOR_LENGTH);
export const SessionDetailTurnIdSchema = z
	.string()
	.min(1)
	.max(MAX_DETAIL_ITEM_ID_LENGTH);

const SessionDetailRevisionInputSchema = z.object({
	revision: SessionDetailRevisionSchema,
	sessionId: z.string().max(MAX_SESSION_ID_LENGTH),
});

export const SessionDetailOverviewInputSchema = z
	.object({
		sessionId: z.string().max(MAX_SESSION_ID_LENGTH),
		turnCursor: z.string().max(MAX_TURN_CURSOR_LENGTH).optional(),
		turnLimit: z
			.number()
			.int()
			.positive()
			.max(SESSION_DETAIL_TURN_PAGE_LIMIT)
			.default(SESSION_DETAIL_TURN_PAGE_LIMIT),
	})
	.strict();

export const SessionDetailWindowRequestSchema = z.discriminatedUnion("mode", [
	z
		.object({
			includeBodies: z.literal(true),
			mode: z.literal("initial"),
			sessionId: z.string().max(MAX_SESSION_ID_LENGTH),
		})
		.strict(),
	z
		.object({
			anchorTurnId: SessionDetailTurnIdSchema,
			includeBodies: z.literal(true),
			mode: z.literal("anchor"),
			revision: SessionDetailRevisionSchema,
			sessionId: z.string().max(MAX_SESSION_ID_LENGTH),
		})
		.strict(),
	z
		.object({
			cursor: SessionDetailWindowCursorSchema,
			includeBodies: z.literal(true),
			mode: z.literal("older"),
			sessionId: z.string().max(MAX_SESSION_ID_LENGTH),
		})
		.strict(),
	z
		.object({
			cursor: SessionDetailWindowCursorSchema,
			includeBodies: z.literal(true),
			mode: z.literal("newer"),
			sessionId: z.string().max(MAX_SESSION_ID_LENGTH),
		})
		.strict(),
]);

export const SessionDetailTurnInputSchema =
	SessionDetailRevisionInputSchema.extend({
		turnId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH),
	}).strict();

export const SessionDetailSpineInputSchema =
	SessionDetailRevisionInputSchema.strict();

export const SessionDetailSubagentInputSchema =
	SessionDetailRevisionInputSchema.extend({
		subagentId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH),
	}).strict();

export const SessionDetailStaleRevisionDataSchema = z
	.object({
		currentRevision: SessionDetailRevisionSchema,
		requestedRevision: SessionDetailRevisionSchema,
	})
	.strict();

export const SessionDetailAnchorNotFoundDataSchema = z
	.object({
		revision: SessionDetailRevisionSchema,
		turnId: SessionDetailTurnIdSchema,
	})
	.strict();

export const SESSION_DETAIL_REVISION_ERRORS = {
	[SESSION_DETAIL_STALE_REVISION_CODE]: {
		data: SessionDetailStaleRevisionDataSchema,
		message: SESSION_DETAIL_STALE_REVISION_MESSAGE,
		status: 409,
	},
} satisfies ErrorMap;

export const SESSION_DETAIL_WINDOW_ERRORS = {
	...SESSION_DETAIL_REVISION_ERRORS,
	[SESSION_DETAIL_ANCHOR_NOT_FOUND_CODE]: {
		data: SessionDetailAnchorNotFoundDataSchema,
		message: SESSION_DETAIL_ANCHOR_NOT_FOUND_MESSAGE,
		status: 404,
	},
} satisfies ErrorMap;

const SessionDetailTimestampSchema = z.string().datetime({ offset: true });
const SessionDetailNullableTimestampSchema =
	SessionDetailTimestampSchema.nullable();
const SessionDetailNullableCountSchema = z
	.number()
	.int()
	.nonnegative()
	.nullable();
const SessionDetailNullableCostSchema = z.number().nonnegative().nullable();
const SessionDetailStringListSchema = z
	.array(z.string().max(MAX_DETAIL_STRING_LENGTH))
	.max(MAX_DETAIL_COLLECTION_LENGTH);
const SessionDetailPreviewSchema = z
	.string()
	.refine(
		(value) =>
			Array.from(value).length <= SESSION_DETAIL_PREVIEW_CODE_POINT_LIMIT,
		`Preview must contain at most ${SESSION_DETAIL_PREVIEW_CODE_POINT_LIMIT} Unicode code points`,
	)
	.nullable();

const SessionDetailFileOperationSchema = z.enum(["created", "edited", "read"]);

const SessionDetailTurnFileEventSchema = z
	.object({
		at: SessionDetailTimestampSchema,
		count: z.number().int().positive(),
		eventId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH).optional(),
		operation: SessionDetailFileOperationSchema,
		path: z.string().min(1).max(MAX_DETAIL_STRING_LENGTH).optional(),
	})
	.strict();

const SessionDetailTurnSubagentEventSchema = z
	.object({
		at: SessionDetailTimestampSchema,
		count: z.number().int().positive(),
		eventId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH).optional(),
		subagentId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH).optional(),
	})
	.strict();

const SessionDetailUsageCallSchema = z
	.object({
		at: SessionDetailTimestampSchema,
		cacheCreationInputTokens: z.number().int().nonnegative(),
		cacheReadInputTokens: z.number().int().nonnegative(),
		contextWindow: z.number().int().positive().nullable(),
		freshInputTokens: z.number().int().nonnegative(),
		model: z.string().max(MAX_DETAIL_STRING_LENGTH).nullable(),
		outputTokens: z.number().int().nonnegative(),
	})
	.strict();

const SessionDetailSignalOccurrenceSchema = z
	.object({
		category: z.enum(["apology", "negative", "positive"]),
		matchedText: z.string().min(1).max(MAX_DETAIL_STRING_LENGTH),
	})
	.strict();

export const SessionDetailTurnSummarySchema = z
	.object({
		activityResolution: z.enum(["exact", "bucketed"]),
		durationSeconds: z.number().nonnegative().nullable(),
		editedFiles: SessionDetailStringListSchema,
		endedAt: SessionDetailNullableTimestampSchema,
		errorCount: z.number().int().nonnegative(),
		errorEvents: z
			.array(
				z
					.object({
						at: SessionDetailTimestampSchema,
						content: z
							.string()
							.refine(
								(value) =>
									Array.from(value).length <=
									SESSION_DETAIL_ACTIVITY_DETAIL_CODE_POINT_LIMIT,
								`Activity detail must contain at most ${SESSION_DETAIL_ACTIVITY_DETAIL_CODE_POINT_LIMIT} Unicode code points`,
							)
							.optional(),
					})
					.strict(),
			)
			.max(SESSION_DETAIL_ACTIVITY_POINT_LIMIT),
		fileEvents: z
			.array(SessionDetailTurnFileEventSchema)
			.max(SESSION_DETAIL_ACTIVITY_POINT_LIMIT)
			.optional(),
		estimatedCost: SessionDetailNullableCostSchema,
		hasBody: z.boolean(),
		index: z.number().int().nonnegative(),
		inputTokens: SessionDetailNullableCountSchema,
		modelSignalCount: z.number().int().nonnegative(),
		outputTokens: SessionDetailNullableCountSchema,
		responsePreview: SessionDetailPreviewSchema,
		signalCount: z.number().int().nonnegative(),
		signalOccurrences: z
			.array(SessionDetailSignalOccurrenceSchema)
			.max(SESSION_DETAIL_SIGNAL_OCCURRENCE_LIMIT),
		signalOccurrencesOmittedCount: z.number().int().nonnegative(),
		signalOccurrencesTruncated: z.boolean(),
		skills: SessionDetailStringListSchema,
		skillCount: z.number().int().nonnegative(),
		skillEvents: z
			.array(
				z
					.object({
						at: SessionDetailTimestampSchema,
						skill: z.string().max(MAX_DETAIL_STRING_LENGTH),
					})
					.strict(),
			)
			.max(SESSION_DETAIL_ACTIVITY_POINT_LIMIT),
		slashCommands: SessionDetailStringListSchema,
		startedAt: SessionDetailNullableTimestampSchema,
		subagentEvents: z
			.array(SessionDetailTurnSubagentEventSchema)
			.max(SESSION_DETAIL_ACTIVITY_POINT_LIMIT)
			.optional(),
		toolCallCount: z.number().int().nonnegative(),
		turnId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH),
		usageCalls: z
			.array(SessionDetailUsageCallSchema)
			.max(SESSION_DETAIL_ACTIVITY_POINT_LIMIT),
		userCharacterCount: z.number().int().nonnegative().optional(),
		userPreview: SessionDetailPreviewSchema,
	})
	.strict();

const SessionDetailActivityTotalsSchema = z
	.object({
		edit: z.number().int().nonnegative(),
		error: z.number().int().nonnegative(),
		read: z.number().int().nonnegative(),
		signal: z.number().int().nonnegative(),
		signalScanVersion: z.number().int().nonnegative(),
		skill: z.number().int().nonnegative(),
		subagent: z.number().int().nonnegative(),
		write: z.number().int().nonnegative(),
	})
	.strict();

const SessionDetailSessionSummarySchema = z
	.object({
		durationMinutes: z.number().nonnegative().nullable(),
		estimatedCost: SessionDetailNullableCostSchema,
		gitBranch: z.string().max(MAX_DETAIL_STRING_LENGTH).nullable(),
		gitSha: z.string().max(MAX_DETAIL_STRING_LENGTH).nullable(),
		inputTokens: z.number().int().nonnegative(),
		lastInteractionDate: SessionDetailTimestampSchema,
		modelUsed: z.string().max(MAX_DETAIL_STRING_LENGTH).nullable(),
		outputTokens: z.number().int().nonnegative(),
		projectPath: z.string().max(MAX_DETAIL_STRING_LENGTH),
		repository: z.string().max(MAX_DETAIL_STRING_LENGTH).nullable(),
		sessionDate: SessionDetailTimestampSchema,
		sessionId: z.string().max(MAX_SESSION_ID_LENGTH),
		skills: SessionDetailStringListSchema,
		slashCommands: SessionDetailStringListSchema,
		source: SourceSchema.nullable(),
		totalTokens: z.number().int().nonnegative(),
		userId: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
	})
	.strict();

const SessionDetailSubagentSummarySchema = z
	.object({
		estimatedCost: SessionDetailNullableCostSchema,
		hasTranscript: z.boolean(),
		inputTokens: SessionDetailNullableCountSchema,
		model: z.string().max(MAX_DETAIL_STRING_LENGTH).nullable(),
		outputTokens: SessionDetailNullableCountSchema,
		subagentId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH),
		totalTokens: SessionDetailNullableCountSchema,
	})
	.strict();

const SessionDetailContextSchema = z
	.object({
		errors: z
			.array(
				z
					.object({
						count: z.number().int().positive(),
						label: z.string().min(1).max(MAX_DETAIL_STRING_LENGTH),
					})
					.strict(),
			)
			.max(SESSION_DETAIL_CONTEXT_ERROR_LIMIT),
		files: z
			.array(
				z
					.object({
						operation: SessionDetailFileOperationSchema,
						path: z.string().min(1).max(MAX_DETAIL_STRING_LENGTH),
					})
					.strict(),
			)
			.max(SESSION_DETAIL_CONTEXT_FILE_LIMIT),
	})
	.strict()
	.default({ errors: [], files: [] });

export const SessionDetailOverviewSchema = z
	.object({
		activityTotals: SessionDetailActivityTotalsSchema,
		context: SessionDetailContextSchema,
		revision: SessionDetailRevisionSchema,
		session: SessionDetailSessionSummarySchema,
		subagents: z
			.array(SessionDetailSubagentSummarySchema)
			.max(MAX_DETAIL_COLLECTION_LENGTH),
		turnPage: z
			.object({
				items: z
					.array(SessionDetailTurnSummarySchema)
					.max(SESSION_DETAIL_TURN_PAGE_LIMIT),
				nextCursor: z.string().max(MAX_TURN_CURSOR_LENGTH).nullable(),
				total: z.number().int().nonnegative(),
			})
			.strict(),
	})
	.strict();

type SessionDetailJsonValue =
	| boolean
	| null
	| number
	| string
	| readonly SessionDetailJsonValue[]
	| { readonly [key: string]: SessionDetailJsonValue };

const SessionDetailJsonValueSchema: z.ZodType<SessionDetailJsonValue> = z.lazy(
	() =>
		z.union([
			z.boolean(),
			z.null(),
			z.number(),
			z.string(),
			z.array(SessionDetailJsonValueSchema),
			z.record(SessionDetailJsonValueSchema),
		]),
);

const SessionDetailTextContentSchema = z
	.object({
		text: z.string(),
		type: z.literal("text"),
	})
	.strict();

const SessionDetailImageContentSchema = z
	.object({
		source: SessionDetailJsonValueSchema,
		type: z.literal("image"),
	})
	.strict();

const SessionDetailTraceToolResultSchema = z
	.object({
		content: z.union([
			z.string(),
			z.array(
				z.discriminatedUnion("type", [
					SessionDetailTextContentSchema,
					SessionDetailImageContentSchema,
				]),
			),
		]),
		isError: z.boolean(),
		subagentId: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH).optional(),
	})
	.strict();

const SessionDetailToolResultContentSchema = z
	.object({
		content: z.union([
			z.string(),
			z.array(
				z.discriminatedUnion("type", [
					SessionDetailTextContentSchema,
					SessionDetailImageContentSchema,
				]),
			),
		]),
		is_error: z.boolean().optional(),
		tool_use_id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
		type: z.literal("tool_result"),
	})
	.strict();

const SessionDetailUserContentSchema = z.union([
	z.string(),
	z.array(
		z.union([
			z.string(),
			SessionDetailTextContentSchema,
			SessionDetailToolResultContentSchema,
		]),
	),
]);

const SessionDetailTraceEventSchema = z.discriminatedUnion("kind", [
	z
		.object({
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			kind: z.literal("reasoning"),
			text: z.string(),
			timestamp: SessionDetailTimestampSchema,
		})
		.strict(),
	z
		.object({
			content: z.union([z.string(), z.array(SessionDetailTextContentSchema)]),
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			kind: z.literal("message"),
			text: z.string(),
			timestamp: SessionDetailTimestampSchema,
		})
		.strict(),
	z
		.object({
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			input: z.record(SessionDetailJsonValueSchema),
			kind: z.literal("tool"),
			result: SessionDetailTraceToolResultSchema.optional(),
			skillContent: z
				.object({
					baseDirectory: z.string(),
					content: z.string(),
				})
				.strict()
				.optional(),
			timestamp: SessionDetailTimestampSchema,
			toolName: z.string().max(MAX_DETAIL_STRING_LENGTH),
		})
		.strict(),
	z
		.object({
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			kind: z.literal("orphan-result"),
			result: SessionDetailTraceToolResultSchema,
			timestamp: SessionDetailTimestampSchema,
		})
		.strict(),
]);

export const SessionDetailTraceItemSchema = z.discriminatedUnion("kind", [
	z
		.object({
			content: SessionDetailUserContentSchema,
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			kind: z.literal("user"),
			timestamp: SessionDetailTimestampSchema,
		})
		.strict(),
	z
		.object({
			agentName: z.string().max(MAX_DETAIL_STRING_LENGTH).optional(),
			events: z.array(SessionDetailTraceEventSchema).max(MAX_TRACE_ITEM_COUNT),
			executionMode: z.enum(["plan", "default", "unknown"]),
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			kind: z.literal("agent"),
			modelSetting: z.string().max(MAX_DETAIL_STRING_LENGTH).optional(),
			timestamp: SessionDetailTimestampSchema,
		})
		.strict(),
	z
		.object({
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			kind: z.literal("system"),
			systemType: z.enum(["context", "interruption", "notification", "system"]),
			text: z.string(),
			timestamp: SessionDetailTimestampSchema,
		})
		.strict(),
	z
		.object({
			id: z.string().max(MAX_DETAIL_ITEM_ID_LENGTH),
			kind: z.literal("summary"),
			text: z.string(),
			timestamp: z.undefined(),
		})
		.strict(),
]);

export const SessionDetailTurnSchema = z
	.object({
		responseItems: z
			.array(SessionDetailTraceItemSchema)
			.max(MAX_TRACE_ITEM_COUNT),
		revision: SessionDetailRevisionSchema,
		turnId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH),
		userItems: z.array(SessionDetailTraceItemSchema).max(MAX_TRACE_ITEM_COUNT),
	})
	.strict();

export const SessionDetailTurnBodySchema = z
	.object({
		responseItems: z
			.array(SessionDetailTraceItemSchema)
			.max(MAX_TRACE_ITEM_COUNT),
		userItems: z.array(SessionDetailTraceItemSchema).max(MAX_TRACE_ITEM_COUNT),
	})
	.strict();

export const SessionDetailWindowTurnSchema =
	SessionDetailTurnSummarySchema.extend({
		body: SessionDetailTurnBodySchema.nullable(),
		bodyOmitted: z.enum(["oversized"]).nullable(),
	}).strict();

export const SessionDetailWindowSchema = z
	.object({
		newerCursor: SessionDetailWindowCursorSchema.nullable(),
		olderCursor: SessionDetailWindowCursorSchema.nullable(),
		revision: SessionDetailRevisionSchema,
		total: z.number().int().nonnegative(),
		turns: z
			.array(SessionDetailWindowTurnSchema)
			.max(SESSION_DETAIL_WINDOW_PAGE_TURNS),
	})
	.strict();

export const SessionDetailSpineTurnSchema = z
	.object({
		eventCount: z.number().int().nonnegative(),
		responseBytes: z.number().int().nonnegative(),
		turnId: SessionDetailTurnIdSchema,
	})
	.strict();

export const SessionDetailSpineSchema = z
	.object({
		revision: SessionDetailRevisionSchema,
		turns: z
			.array(SessionDetailSpineTurnSchema)
			.max(MAX_SESSION_DETAIL_SPINE_TURNS),
	})
	.strict();

export const SessionDetailSubagentSchema = z
	.object({
		content: z.string().max(MAX_TRANSCRIPT_CODE_UNITS),
		revision: SessionDetailRevisionSchema,
		subagentId: z.string().min(1).max(MAX_DETAIL_ITEM_ID_LENGTH),
	})
	.strict();

export type SessionDetailOverviewInput = z.infer<
	typeof SessionDetailOverviewInputSchema
>;
export type SessionDetailSpineInput = z.infer<
	typeof SessionDetailSpineInputSchema
>;
export type SessionDetailSpine = z.infer<typeof SessionDetailSpineSchema>;
export type SessionDetailSpineTurn = z.infer<
	typeof SessionDetailSpineTurnSchema
>;
export type SessionDetailWindowRequest = z.infer<
	typeof SessionDetailWindowRequestSchema
>;
export type SessionDetailWindow = z.infer<typeof SessionDetailWindowSchema>;
export type SessionDetailTurnSummary = z.infer<
	typeof SessionDetailTurnSummarySchema
>;
export type SessionDetailWindowTurn = z.infer<
	typeof SessionDetailWindowTurnSchema
>;
export type SessionDetailTurnBody = z.infer<typeof SessionDetailTurnBodySchema>;
export type SessionDetailAnchorNotFoundData = z.infer<
	typeof SessionDetailAnchorNotFoundDataSchema
>;
export type SessionDetailTurnInput = z.infer<
	typeof SessionDetailTurnInputSchema
>;
export type SessionDetailSubagentInput = z.infer<
	typeof SessionDetailSubagentInputSchema
>;
export type SessionDetailStaleRevisionData = z.infer<
	typeof SessionDetailStaleRevisionDataSchema
>;
export type SessionDetailOverview = z.infer<typeof SessionDetailOverviewSchema>;
export type SessionDetailTraceItem = z.infer<
	typeof SessionDetailTraceItemSchema
>;
export type SessionDetailTurn = z.infer<typeof SessionDetailTurnSchema>;
export type SessionDetailSubagent = z.infer<typeof SessionDetailSubagentSchema>;
