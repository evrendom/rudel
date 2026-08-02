import { z } from "zod";
import { formatCurrency, formatUsername } from "@/lib/format";
import {
	createSessionMetadataBadges,
	getConversationSummary,
	toContentString,
	toNumber,
	toOptionalString,
	toStringArray,
	toSubagentMap,
} from "./session-detail-view-utils";

const subagentTokenUsageSchema = z.object({
	cache_creation_input_tokens: z.number().nonnegative().optional(),
	cache_read_input_tokens: z.number().nonnegative().optional(),
	input_tokens: z.number().nonnegative().optional(),
	output_tokens: z.number().nonnegative().optional(),
});

const subagentTranscriptLineSchema = z.object({
	message: z
		.object({
			id: z.string().optional(),
			model: z.string().optional(),
			usage: subagentTokenUsageSchema.optional(),
		})
		.optional(),
	type: z.string().optional(),
});

type SubagentTranscriptLine = z.infer<typeof subagentTranscriptLineSchema>;

type ClaudeAssistantLine = {
	id: string | undefined;
	model: string | undefined;
	usage: z.infer<typeof subagentTokenUsageSchema> | undefined;
};

export interface SessionSubagentSummary {
	id: string;
	model: string | undefined;
	totalTokens: number | undefined;
}

export interface SessionDetailViewModelSource {
	content?: unknown;
	duration_min?: unknown;
	estimated_cost?: unknown;
	git_branch?: unknown;
	git_sha?: unknown;
	input_tokens?: unknown;
	is_capped?: unknown;
	model_used?: unknown;
	output_tokens?: unknown;
	repository?: unknown;
	session_date?: unknown;
	session_id?: unknown;
	skills?: unknown;
	slash_commands?: unknown;
	subagents?: unknown;
	stale_extraction?: unknown;
	total_interactions?: unknown;
	user_id?: unknown;
}

function parseSubagentTranscriptLine(
	line: string,
): SubagentTranscriptLine | undefined {
	try {
		const result = subagentTranscriptLineSchema.safeParse(JSON.parse(line));
		return result.success ? result.data : undefined;
	} catch {
		return undefined;
	}
}

function getClaudeTokenTotal(
	assistantLines: readonly ClaudeAssistantLine[],
): number | undefined {
	const deduplicatedLines = assistantLines.filter(
		(line, index) => !line.id || line.id !== assistantLines[index + 1]?.id,
	);
	let hasUsage = false;
	const totalTokens = deduplicatedLines.reduce((total, line) => {
		if (!line.usage) {
			return total;
		}

		hasUsage = true;
		return (
			total +
			(line.usage.input_tokens ?? 0) +
			(line.usage.cache_read_input_tokens ?? 0) +
			(line.usage.cache_creation_input_tokens ?? 0) +
			(line.usage.output_tokens ?? 0)
		);
	}, 0);

	return hasUsage ? totalTokens : undefined;
}

function summarizeSubagentTranscript(
	id: string,
	content: string,
): SessionSubagentSummary {
	const assistantLines: ClaudeAssistantLine[] = [];

	for (const rawLine of content.split("\n")) {
		if (!rawLine.trim()) {
			continue;
		}

		const line = parseSubagentTranscriptLine(rawLine);
		if (!line) {
			continue;
		}

		if (line.type === "assistant" && line.message) {
			assistantLines.push({
				id: line.message.id,
				model: line.message.model,
				usage: line.message.usage,
			});
		}
	}

	const claudeModel = assistantLines.reduce<string | undefined>(
		(model, line) => line.model ?? model,
		undefined,
	);
	return {
		id,
		model: claudeModel,
		totalTokens: getClaudeTokenTotal(assistantLines),
	};
}

export function summarizeSessionSubagents(
	subagents: Readonly<Record<string, string>>,
) {
	return Object.entries(subagents).map(([id, content]) =>
		summarizeSubagentTranscript(id, content),
	);
}

export function buildSessionDetailViewModel(
	session: SessionDetailViewModelSource,
	userMap: Record<string, string>,
) {
	const safeSessionId =
		toOptionalString(session.session_id) ?? "unknown-session";
	const safeSessionDate = toOptionalString(session.session_date) ?? "";
	const safeUserId = toOptionalString(session.user_id) ?? "unknown-user";
	const safeUserDisplayName =
		safeUserId === "unknown-user"
			? "User"
			: formatUsername(safeUserId, userMap);
	const safeInputTokens = toNumber(session.input_tokens);
	const safeOutputTokens = toNumber(session.output_tokens);
	const estimatedCost =
		typeof session.estimated_cost === "number" &&
		Number.isFinite(session.estimated_cost)
			? session.estimated_cost
			: null;
	const safeDurationMin =
		session.duration_min === undefined
			? undefined
			: toNumber(session.duration_min);
	const safeTotalInteractions =
		session.total_interactions === undefined
			? undefined
			: toNumber(session.total_interactions);
	const safeSkills = toStringArray(session.skills);
	const safeSlashCommands = toStringArray(session.slash_commands);
	const safeSubagents = toSubagentMap(session.subagents);
	const safeRepository = toOptionalString(session.repository);
	const safeGitBranch = toOptionalString(session.git_branch);
	const safeGitSha = toOptionalString(session.git_sha);
	const safeModelUsed = toOptionalString(session.model_used) ?? undefined;
	const safeIsPartialData =
		session.is_capped === true ||
		toNumber(session.is_capped) > 0 ||
		session.stale_extraction === true ||
		toNumber(session.stale_extraction) > 0;
	const safeContent = toContentString(session.content);
	const metadataBadges = createSessionMetadataBadges({
		gitBranch: safeGitBranch,
		repository: safeRepository,
	});
	const conversationSummary = getConversationSummary(safeContent);
	const subagentSummaries = summarizeSessionSubagents(safeSubagents);
	const subagentNames = subagentSummaries.map((subagent) => subagent.id);
	const tokenUsageLabel = `${safeInputTokens.toLocaleString()} / ${safeOutputTokens.toLocaleString()}`;
	const costLabel = formatCurrency(estimatedCost);

	return {
		conversationSummary,
		costLabel,
		metadataBadges,
		safeContent,
		safeDurationMin,
		safeGitSha,
		safeInputTokens,
		safeIsPartialData,
		safeModelUsed,
		safeOutputTokens,
		safeSessionDate,
		safeSessionId,
		safeSkills,
		safeSlashCommands,
		safeSubagents,
		safeTotalInteractions,
		safeUserDisplayName,
		safeUserId,
		subagentNames,
		subagentSummaries,
		tokenUsageLabel,
	};
}
