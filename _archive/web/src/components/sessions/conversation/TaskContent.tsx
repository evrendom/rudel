import { Bot, CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ToolResultContent } from "@/lib/conversation-schema";

interface TaskInput {
	subagent_type: string;
	description: string;
	prompt: string;
	run_in_background?: boolean;
	model?: string;
}

interface TaskResult {
	isAsync?: boolean;
	status?: "async_launched" | "completed";
	agentId?: string;
	description?: string;
	outputFile?: string;
}

interface TaskContentProps {
	input: TaskInput;
	toolResult: ToolResultContent | undefined;
}

export function TaskContent({ input, toolResult }: TaskContentProps) {
	const result = parseTaskResult(toolResult);
	const agentCategory = getAgentCategory(input.subagent_type);
	const agentName = formatAgentName(input.subagent_type);

	return (
		<div className="space-y-2">
			{/* Agent type header */}
			<div className="flex items-center gap-2 flex-wrap">
				<div className="flex items-center gap-1.5">
					<Bot className="h-4 w-4 text-purple-500" />
					<span className="text-xs font-medium">{agentName}</span>
				</div>
				<Badge variant="outline" className={getAgentBadgeClass(agentCategory)}>
					{agentCategory}
				</Badge>
				{input.run_in_background && (
					<Badge variant="secondary" className="text-xs">
						<Clock className="h-3 w-3 mr-1" />
						Background
					</Badge>
				)}
				{input.model && (
					<Badge variant="outline" className="text-xs text-muted-foreground">
						{input.model}
					</Badge>
				)}
			</div>

			{/* Description */}
			<div>
				<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
					Task
				</h4>
				<p className="text-sm">{input.description}</p>
			</div>

			{/* Prompt preview */}
			<div>
				<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
					Prompt
				</h4>
				<pre className="text-xs bg-background/50 p-2 rounded-md border overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
					{input.prompt}
				</pre>
			</div>

			{/* Result status */}
			{result && (
				<div className="flex items-center gap-2 text-xs pt-1 border-t">
					{result.isAsync ? (
						<>
							<PlayCircle className="h-3.5 w-3.5 text-blue-500" />
							<span className="text-blue-600 dark:text-blue-400">
								Agent launched
							</span>
						</>
					) : (
						<>
							<CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
							<span className="text-green-600 dark:text-green-400">
								Completed
							</span>
						</>
					)}
					{result.agentId && (
						<code className="text-muted-foreground bg-muted px-1 rounded">
							{result.agentId}
						</code>
					)}
				</div>
			)}
		</div>
	);
}

export function formatTaskSummary(input: TaskInput): string {
	const agentName = formatAgentName(input.subagent_type);
	return `${agentName}: ${input.description}`;
}

function parseTaskResult(
	toolResult: ToolResultContent | undefined,
): TaskResult | null {
	if (!toolResult) return null;

	const content = toolResult.content;

	if (typeof content === "string") {
		const agentIdMatch = content.match(/agentId:\s*([a-f0-9]+)/i);
		return {
			isAsync: content.includes("launched"),
			agentId: agentIdMatch?.[1],
		};
	}

	if (Array.isArray(content)) {
		const text = content
			.filter(
				(block): block is { type: "text"; text: string } =>
					block.type === "text",
			)
			.map((block) => block.text)
			.join("\n");

		const agentIdMatch = text.match(/agentId:\s*([a-f0-9]+)/i);
		return {
			isAsync: text.includes("launched"),
			agentId: agentIdMatch?.[1],
		};
	}

	if (typeof content === "object" && content !== null) {
		const obj = content as unknown as TaskResult;
		return {
			isAsync: obj.isAsync,
			status: obj.status,
			agentId: obj.agentId,
			outputFile: obj.outputFile,
		};
	}

	return null;
}

function formatAgentName(subagentType: string): string {
	const name = subagentType
		.replace(/^code:/, "")
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return name;
}

function getAgentCategory(subagentType: string): string {
	if (subagentType.startsWith("code:")) return "code";
	if (subagentType === "Explore") return "explore";
	if (subagentType === "Plan") return "plan";
	if (subagentType === "Bash") return "bash";
	if (subagentType.includes("locator")) return "search";
	if (subagentType.includes("analyzer")) return "analyze";
	if (subagentType.includes("researcher")) return "research";
	return "agent";
}

function getAgentBadgeClass(category: string): string {
	switch (category) {
		case "code":
			return "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300";
		case "explore":
			return "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300";
		case "plan":
			return "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300";
		case "search":
			return "border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-300";
		case "analyze":
			return "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300";
		case "research":
			return "border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300";
		default:
			return "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300";
	}
}
