import { z } from "zod";
import {
	isCodexFormat,
	parseCodexConversations,
} from "./codex-conversation-parser";

// Content block schemas
export const TextContentSchema = z.object({
	type: z.literal("text"),
	text: z.string(),
});

export const ThinkingContentSchema = z.object({
	type: z.literal("thinking"),
	thinking: z.string(),
	signature: z.string().optional(),
});

export const ToolUseContentSchema = z.object({
	type: z.literal("tool_use"),
	id: z.string(),
	name: z.string(),
	input: z.record(z.string(), z.unknown()),
});

export const ToolResultContentSchema = z.object({
	type: z.literal("tool_result"),
	tool_use_id: z.string(),
	content: z.union([
		z.string(),
		z.array(
			z.union([
				TextContentSchema,
				z.object({ type: z.literal("image"), source: z.unknown() }),
			]),
		),
	]),
	is_error: z.boolean().optional(),
});

// Message schemas
export const UserMessageSchema = z.object({
	role: z.literal("user"),
	content: z.union([
		z.string(),
		z.array(z.union([z.string(), TextContentSchema, ToolResultContentSchema])),
	]),
});

export const AssistantMessageSchema = z.object({
	role: z.literal("assistant"),
	content: z.array(
		z.union([TextContentSchema, ThinkingContentSchema, ToolUseContentSchema]),
	),
});

export const ConversationExecutionModeSchema = z.enum([
	"plan",
	"default",
	"unknown",
]);

// Entry schemas
const BaseEntrySchema = z.object({
	uuid: z.string(),
	timestamp: z.string(),
	sessionId: z.string(),
});

export const UserEntrySchema = BaseEntrySchema.extend({
	isMeta: z.boolean().optional(),
	type: z.literal("user"),
	message: UserMessageSchema,
});

export const AssistantEntrySchema = BaseEntrySchema.extend({
	executionMode: ConversationExecutionModeSchema.default("unknown"),
	type: z.literal("assistant"),
	message: AssistantMessageSchema,
});

export const SummaryEntrySchema = z.object({
	type: z.literal("summary"),
	summary: z.string(),
});

export const SystemEntrySchema = BaseEntrySchema.extend({
	type: z.literal("system"),
	message: z.object({ content: z.string() }),
});

// Union type
export const ConversationSchema = z.union([
	UserEntrySchema,
	AssistantEntrySchema,
	SummaryEntrySchema,
	SystemEntrySchema,
]);

export type TextContent = z.infer<typeof TextContentSchema>;
export type ThinkingContent = z.infer<typeof ThinkingContentSchema>;
export type ToolUseContent = z.infer<typeof ToolUseContentSchema>;
export type ToolResultContent = z.infer<typeof ToolResultContentSchema>;
export type ConversationExecutionMode = z.infer<
	typeof ConversationExecutionModeSchema
>;
export type UserEntry = z.infer<typeof UserEntrySchema>;
export type AssistantEntry = z.infer<typeof AssistantEntrySchema>;
export type SummaryEntry = z.infer<typeof SummaryEntrySchema>;
export type SystemEntry = z.infer<typeof SystemEntrySchema>;
export type Conversation = z.infer<typeof ConversationSchema>;

function readPermissionMode(value: unknown): string | undefined {
	if (
		typeof value !== "object" ||
		value === null ||
		!("permissionMode" in value) ||
		typeof value.permissionMode !== "string"
	) {
		return undefined;
	}

	return value.permissionMode;
}

function toExecutionMode(permissionMode: string): ConversationExecutionMode {
	return permissionMode === "plan" ? "plan" : "default";
}

// Parser
export function parseConversations(content: string): Array<Conversation> {
	if (isCodexFormat(content)) {
		return parseCodexConversations(content);
	}

	const conversations: Array<Conversation> = [];
	const lines = content.split("\n").filter(Boolean);
	let executionMode: ConversationExecutionMode = "unknown";
	const pendingExitPlanToolIds = new Set<string>();

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line) as unknown;
			const permissionMode = readPermissionMode(parsed);
			const result = ConversationSchema.safeParse(parsed);
			if (result.success) {
				const entry = result.data;

				if (entry.type === "user" && permissionMode !== undefined) {
					executionMode = toExecutionMode(permissionMode);
					pendingExitPlanToolIds.clear();
				}

				if (entry.type === "assistant") {
					conversations.push({ ...entry, executionMode });
					for (const block of entry.message.content) {
						if (block.type === "tool_use" && block.name === "ExitPlanMode") {
							pendingExitPlanToolIds.add(block.id);
						}
					}
					continue;
				}

				conversations.push(entry);
				if (entry.type !== "user" || !Array.isArray(entry.message.content)) {
					continue;
				}

				for (const block of entry.message.content) {
					if (
						typeof block !== "string" &&
						block.type === "tool_result" &&
						pendingExitPlanToolIds.has(block.tool_use_id)
					) {
						pendingExitPlanToolIds.delete(block.tool_use_id);
						if (block.is_error !== true) {
							executionMode = "default";
						}
					}
				}
			}
		} catch {
			// Skip malformed lines
		}
	}

	return conversations;
}

export { isCodexFormat } from "./codex-conversation-parser";
