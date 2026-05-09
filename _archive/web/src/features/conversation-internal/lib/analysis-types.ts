export interface TokenDataPoint {
	messageIndex: number;
	inputTokens: number;
	outputTokens: number;
}

export interface ToolActivityPoint {
	messageIndex: number;
	category: "tool" | "skill" | "subagent";
	name: string;
	isError: boolean;
}
