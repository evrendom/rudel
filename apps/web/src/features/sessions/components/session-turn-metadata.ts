import { calculateEstimatedCost } from "@rudel/api-routes";
import { z } from "zod";
import { isCodexFormat } from "@/lib/conversation-schema";
import {
	addUniqueEditedFiles,
	getClaudeMutationFiles,
	getCodexMutationFiles,
} from "./session-turn-file-edits";
import type { SessionTurn } from "./session-turns";

const tokenUsageSchema = z.object({
	cache_creation_input_tokens: z.number().nonnegative().optional(),
	cache_read_input_tokens: z.number().nonnegative().optional(),
	cached_input_tokens: z.number().nonnegative().optional(),
	input_tokens: z.number().nonnegative().optional(),
	output_tokens: z.number().nonnegative().optional(),
});

const claudeContentBlockSchema = z.object({
	id: z.string().nullable().optional(),
	input: z.record(z.string(), z.unknown()).nullable().optional(),
	is_error: z.boolean().nullable().optional(),
	name: z.string().nullable().optional(),
	tool_use_id: z.string().nullable().optional(),
	type: z.string().optional(),
});

const claudeLineSchema = z.object({
	isApiErrorMessage: z.boolean().nullable().optional(),
	message: z
		.object({
			content: z
				.union([z.string(), z.array(claudeContentBlockSchema)])
				.optional(),
			id: z.string().optional(),
			model: z.string().optional(),
			usage: tokenUsageSchema.optional(),
		})
		.optional(),
	timestamp: z.string().optional(),
	type: z.string().optional(),
});

const codexLineSchema = z.object({
	payload: z
		.object({
			arguments: z.string().optional(),
			call_id: z.string().optional(),
			info: z
				.object({
					last_token_usage: tokenUsageSchema.optional(),
					total_token_usage: tokenUsageSchema.optional(),
				})
				.nullable()
				.optional(),
			model: z.string().optional(),
			name: z.string().optional(),
			input: z.string().optional(),
			output: z.string().optional(),
			type: z.string().optional(),
		})
		.optional(),
	timestamp: z.string().optional(),
	type: z.string().optional(),
});

const codexFunctionArgumentsSchema = z.object({
	cmd: z.string().optional(),
});

const codexToolOutputSchema = z.object({
	metadata: z
		.object({
			exit_code: z.number().optional(),
		})
		.optional(),
	output: z.string().optional(),
});

const CODEX_TOOL_FAILURE_PATTERN =
	/(?:Error|Exception):|apply_patch verification failed:/iu;

type TokenUsage = z.infer<typeof tokenUsageSchema>;

export type TokenUsageEvent = {
	at: string;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	inputTokens: number;
	model: string | undefined;
	outputTokens: number;
};

type TurnMetricsBuilder = {
	editedFiles: string[];
	errorCount: number;
	skills: string[];
	usageEvents: TokenUsageEvent[];
};

type PendingFileEdit = {
	builder: TurnMetricsBuilder;
	files: readonly string[];
};

export type SessionTurnMetrics = {
	editedFiles: readonly string[];
	errorCount: number;
	estimatedCost: number | undefined;
	inputTokens: number | undefined;
	outputTokens: number | undefined;
	skills: readonly string[];
	usageEvents: readonly TokenUsageEvent[];
};

type SessionTurnMetadataOptions = {
	fallbackModel: string | undefined;
	subagents?: Readonly<Record<string, string>>;
	turns: readonly SessionTurn[];
};

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function createTurnMetricsBuilders(turnCount: number): TurnMetricsBuilder[] {
	return Array.from(
		{ length: turnCount },
		(): TurnMetricsBuilder => ({
			editedFiles: [],
			errorCount: 0,
			skills: [],
			usageEvents: [],
		}),
	);
}

function getTurnAnchorTimestamp(turn: SessionTurn) {
	for (const item of [...turn.userItems, ...turn.responseItems]) {
		if (item.timestamp) {
			return Date.parse(item.timestamp);
		}
	}

	return undefined;
}

function getTurnIndex(
	timestamp: string | undefined,
	anchors: readonly (number | undefined)[],
) {
	if (!timestamp) {
		return undefined;
	}

	const eventTime = Date.parse(timestamp);
	if (Number.isNaN(eventTime)) {
		return undefined;
	}

	for (let index = anchors.length - 1; index >= 0; index--) {
		const anchor = anchors[index];
		if (anchor !== undefined && eventTime >= anchor) {
			return index;
		}
	}

	return undefined;
}

function addSkill(builder: TurnMetricsBuilder, skill: string | undefined) {
	const normalizedSkill = skill?.trim();
	if (!normalizedSkill || builder.skills.includes(normalizedSkill)) {
		return;
	}

	builder.skills.push(normalizedSkill);
}

function addUsageEvent(
	builder: TurnMetricsBuilder,
	usage: TokenUsage,
	at: string,
	model: string | undefined,
	inputIncludesCache: boolean,
) {
	const cacheReadInputTokens =
		usage.cache_read_input_tokens ?? usage.cached_input_tokens ?? 0;
	const cacheCreationInputTokens = usage.cache_creation_input_tokens ?? 0;
	const recordedInputTokens = usage.input_tokens ?? 0;
	const inputTokens = inputIncludesCache
		? Math.max(0, recordedInputTokens - cacheReadInputTokens)
		: recordedInputTokens;
	const outputTokens = usage.output_tokens ?? 0;

	if (
		inputTokens === 0 &&
		outputTokens === 0 &&
		cacheReadInputTokens === 0 &&
		cacheCreationInputTokens === 0
	) {
		return;
	}

	builder.usageEvents.push({
		at,
		cacheCreationInputTokens,
		cacheReadInputTokens,
		inputTokens,
		model,
		outputTokens,
	});
}

function extractClaudeTurnMetadata(
	content: string,
	builders: TurnMetricsBuilder[],
	anchors: readonly (number | undefined)[],
	fallbackModel: string | undefined,
	editsOnly: boolean,
) {
	let previousAssistantId: string | undefined;
	const pendingFileEdits = new Map<string, PendingFileEdit>();

	for (const rawLine of content.split("\n")) {
		if (!rawLine.trim()) {
			continue;
		}

		const result = claudeLineSchema.safeParse(parseJson(rawLine));
		if (!result.success) {
			continue;
		}

		const line = result.data;
		const turnIndex = getTurnIndex(line.timestamp, anchors);
		const builder = turnIndex === undefined ? undefined : builders[turnIndex];
		if (!builder) {
			continue;
		}

		if (!editsOnly && line.isApiErrorMessage === true) {
			builder.errorCount += 1;
		}

		const contentBlocks = Array.isArray(line.message?.content)
			? line.message.content
			: [];
		if (!editsOnly) {
			builder.errorCount += contentBlocks.filter(
				(block) => block.is_error === true,
			).length;
		}

		for (const block of contentBlocks) {
			const mutationFiles = getClaudeMutationFiles(block);
			if (block.id && mutationFiles.length > 0) {
				pendingFileEdits.set(block.id, { builder, files: mutationFiles });
			}

			if (block.type === "tool_result" && block.tool_use_id) {
				const pendingEdit = pendingFileEdits.get(block.tool_use_id);
				if (pendingEdit) {
					if (block.is_error !== true) {
						addUniqueEditedFiles(
							pendingEdit.builder.editedFiles,
							pendingEdit.files,
						);
					}
					pendingFileEdits.delete(block.tool_use_id);
				}
			}

			if (editsOnly || block.type !== "tool_use" || block.name !== "Skill") {
				continue;
			}

			const skill = block.input?.skill;
			addSkill(builder, typeof skill === "string" ? skill : undefined);
		}

		if (editsOnly || line.type !== "assistant") {
			continue;
		}

		const assistantId = line.message?.id;
		const isDuplicateUsage =
			assistantId !== undefined && assistantId === previousAssistantId;
		previousAssistantId = assistantId;

		if (line.message?.usage && line.timestamp && !isDuplicateUsage) {
			addUsageEvent(
				builder,
				line.message.usage,
				line.timestamp,
				line.message.model ?? fallbackModel,
				false,
			);
		}
	}
}

function getCodexSkillCommand(argumentsJson: string | undefined) {
	if (!argumentsJson) {
		return undefined;
	}

	const result = codexFunctionArgumentsSchema.safeParse(
		parseJson(argumentsJson),
	);
	return result.success ? result.data.cmd : undefined;
}

function addCodexSkills(
	builder: TurnMetricsBuilder,
	argumentsJson: string | undefined,
) {
	const command = getCodexSkillCommand(argumentsJson);
	if (!command) {
		return;
	}

	for (const match of command.matchAll(
		/skills\/([a-zA-Z0-9_-]+)\/SKILL(?:\.md)?/gu,
	)) {
		addSkill(builder, match[1]);
	}
}

function countCodexToolErrors(outputEnvelope: string | undefined) {
	if (!outputEnvelope) {
		return 0;
	}

	const result = codexToolOutputSchema.safeParse(parseJson(outputEnvelope));
	if (!result.success) {
		return CODEX_TOOL_FAILURE_PATTERN.test(outputEnvelope) ? 1 : 0;
	}

	const output = result.data.output ?? "";
	return (
		(result.data.metadata?.exit_code && result.data.metadata.exit_code !== 0
			? 1
			: 0) + (CODEX_TOOL_FAILURE_PATTERN.test(output) ? 1 : 0)
	);
}

function getTokenUsageSignature(usage: TokenUsage | undefined) {
	if (!usage) {
		return undefined;
	}

	return [
		usage.input_tokens ?? 0,
		usage.cached_input_tokens ?? usage.cache_read_input_tokens ?? 0,
		usage.output_tokens ?? 0,
	].join(":");
}

function extractCodexTurnMetadata(
	content: string,
	builders: TurnMetricsBuilder[],
	anchors: readonly (number | undefined)[],
	fallbackModel: string | undefined,
) {
	let currentModel = fallbackModel;
	let previousTokenUsageSignature: string | undefined;
	const pendingFileEdits = new Map<string, PendingFileEdit>();

	for (const rawLine of content.split("\n")) {
		if (!rawLine.trim()) {
			continue;
		}

		const result = codexLineSchema.safeParse(parseJson(rawLine));
		if (!result.success) {
			continue;
		}

		const line = result.data;
		if (line.type === "turn_context" && line.payload?.model) {
			currentModel = line.payload.model;
		}

		const turnIndex = getTurnIndex(line.timestamp, anchors);
		const builder = turnIndex === undefined ? undefined : builders[turnIndex];
		if (!builder) {
			continue;
		}

		if (
			line.type === "response_item" &&
			(line.payload?.type === "function_call" ||
				line.payload?.type === "custom_tool_call")
		) {
			if (line.payload.name === "exec_command") {
				addCodexSkills(builder, line.payload.arguments);
			}

			const mutationFiles = getCodexMutationFiles(
				line.payload.name,
				line.payload.arguments,
				line.payload.input,
			);
			if (line.payload.call_id && mutationFiles.length > 0) {
				pendingFileEdits.set(line.payload.call_id, {
					builder,
					files: mutationFiles,
				});
			}
			continue;
		}

		if (
			line.type === "response_item" &&
			(line.payload?.type === "function_call_output" ||
				line.payload?.type === "custom_tool_call_output")
		) {
			const errorCount = countCodexToolErrors(line.payload.output);
			builder.errorCount += errorCount;

			if (line.payload.call_id) {
				const pendingEdit = pendingFileEdits.get(line.payload.call_id);
				if (pendingEdit) {
					if (errorCount === 0) {
						addUniqueEditedFiles(
							pendingEdit.builder.editedFiles,
							pendingEdit.files,
						);
					}
					pendingFileEdits.delete(line.payload.call_id);
				}
			}
			continue;
		}

		if (
			line.type !== "event_msg" ||
			line.payload?.type !== "token_count" ||
			!line.timestamp
		) {
			continue;
		}

		const totalUsage = line.payload.info?.total_token_usage;
		if (!totalUsage) {
			continue;
		}

		const signature = getTokenUsageSignature(totalUsage);
		if (!signature || signature === previousTokenUsageSignature) {
			continue;
		}

		previousTokenUsageSignature = signature;
		const turnUsage = line.payload.info?.last_token_usage ?? totalUsage;
		addUsageEvent(builder, turnUsage, line.timestamp, currentModel, true);
	}
}

function finalizeTurnMetrics(builder: TurnMetricsBuilder): SessionTurnMetrics {
	const inputTokens =
		builder.usageEvents.length === 0
			? undefined
			: builder.usageEvents.reduce(
					(total, event) =>
						total +
						event.inputTokens +
						event.cacheReadInputTokens +
						event.cacheCreationInputTokens,
					0,
				);
	const outputTokens =
		builder.usageEvents.length === 0
			? undefined
			: builder.usageEvents.reduce(
					(total, event) => total + event.outputTokens,
					0,
				);
	const costs = builder.usageEvents.map((event) =>
		calculateEstimatedCost({
			at: event.at,
			cacheCreationInputTokens: event.cacheCreationInputTokens,
			cacheReadInputTokens: event.cacheReadInputTokens,
			inputTokens: event.inputTokens,
			model: event.model ?? null,
			outputTokens: event.outputTokens,
		}),
	);
	const estimatedCost =
		costs.length === 0 || costs.some((cost) => cost === null)
			? undefined
			: costs.reduce<number>((total, cost) => total + (cost ?? 0), 0);

	return {
		editedFiles: builder.editedFiles,
		errorCount: builder.errorCount,
		estimatedCost,
		inputTokens,
		outputTokens,
		skills: builder.skills,
		usageEvents: builder.usageEvents,
	};
}

export function extractSessionTurnMetrics(
	content: string,
	options: SessionTurnMetadataOptions,
) {
	const anchors = options.turns.map(getTurnAnchorTimestamp);
	const builders = createTurnMetricsBuilders(options.turns.length);

	if (isCodexFormat(content)) {
		extractCodexTurnMetadata(content, builders, anchors, options.fallbackModel);
	} else {
		extractClaudeTurnMetadata(
			content,
			builders,
			anchors,
			options.fallbackModel,
			false,
		);
		for (const subagentContent of Object.values(options.subagents ?? {})) {
			extractClaudeTurnMetadata(
				subagentContent,
				builders,
				anchors,
				options.fallbackModel,
				true,
			);
		}
	}

	return builders.map(finalizeTurnMetrics);
}
