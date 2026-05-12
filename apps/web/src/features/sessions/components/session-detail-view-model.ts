import { calculateCost, formatUsername } from "@/lib/format";
import {
	createSessionMetadataBadges,
	getConversationSummary,
	toContentString,
	toNumber,
	toOptionalString,
	toStringArray,
	toSubagentMap,
} from "./session-detail-view-parts";

export interface SessionDetailViewModelSource {
	content?: unknown;
	duration_min?: unknown;
	git_branch?: unknown;
	git_sha?: unknown;
	input_tokens?: unknown;
	model_used?: unknown;
	output_tokens?: unknown;
	repository?: unknown;
	session_archetype?: unknown;
	session_date?: unknown;
	session_id?: unknown;
	skills?: unknown;
	slash_commands?: unknown;
	subagents?: unknown;
	success_score?: unknown;
	total_interactions?: unknown;
	user_id?: unknown;
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
	const safeDurationMin =
		session.duration_min === undefined
			? undefined
			: toNumber(session.duration_min);
	const safeTotalInteractions =
		session.total_interactions === undefined
			? undefined
			: toNumber(session.total_interactions);
	const safeSuccessScore =
		session.success_score === undefined
			? undefined
			: toNumber(session.success_score);
	const safeSkills = toStringArray(session.skills);
	const safeSlashCommands = toStringArray(session.slash_commands);
	const safeSubagents = toSubagentMap(session.subagents);
	const safeRepository = toOptionalString(session.repository);
	const safeGitBranch = toOptionalString(session.git_branch);
	const safeGitSha = toOptionalString(session.git_sha);
	const safeModelUsed = toOptionalString(session.model_used) ?? undefined;
	const safeSessionArchetype =
		toOptionalString(session.session_archetype) ?? undefined;
	const safeContent = toContentString(session.content);
	const metadataBadges = createSessionMetadataBadges({
		gitBranch: safeGitBranch,
		repository: safeRepository,
	});
	const conversationSummary = getConversationSummary(safeContent);
	const subagentNames = Object.keys(safeSubagents);
	const tokenUsageLabel = `${safeInputTokens.toLocaleString()} / ${safeOutputTokens.toLocaleString()}`;
	const costLabel = `$${calculateCost(
		safeInputTokens,
		safeOutputTokens,
		safeModelUsed,
	).toFixed(4)}`;

	return {
		conversationSummary,
		costLabel,
		metadataBadges,
		safeContent,
		safeDurationMin,
		safeGitSha,
		safeInputTokens,
		safeModelUsed,
		safeOutputTokens,
		safeSessionArchetype,
		safeSessionDate,
		safeSessionId,
		safeSkills,
		safeSlashCommands,
		safeSubagents,
		safeSuccessScore,
		safeTotalInteractions,
		safeUserDisplayName,
		subagentNames,
		tokenUsageLabel,
	};
}
