export interface TokenDataPoint {
	messageIndex: number;
	inputTokens: number;
	outputTokens: number;
	uncachedInputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	totalTokens?: number;
	source?: "parent" | "subagent";
	sourceId?: string;
	timestamp?: string;
}

export interface ToolActivityPoint {
	messageIndex: number;
	category: "tool" | "skill" | "subagent";
	name: string;
	isError: boolean;
}
