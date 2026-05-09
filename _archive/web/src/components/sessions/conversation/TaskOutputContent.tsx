import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	FileOutput,
	Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ToolResultContent } from "@/lib/conversation-schema";

interface TaskOutputInput {
	task_id: string;
	block?: boolean;
	timeout?: number;
}

interface TaskOutputResult {
	retrieval_status?: "timeout" | "success";
	task?: {
		task_id: string;
		task_type?: string;
		status?: "running" | "completed";
		description?: string;
		output?: string;
		prompt?: string;
		result?: string;
	};
}

interface TaskOutputContentProps {
	input: TaskOutputInput;
	toolResult: ToolResultContent | undefined;
}

export function TaskOutputContent({
	input,
	toolResult,
}: TaskOutputContentProps) {
	const result = parseTaskOutputResult(toolResult);

	return (
		<div className="space-y-2">
			{/* Task reference header */}
			<div className="flex items-center gap-2 flex-wrap">
				<FileOutput className="h-4 w-4 text-muted-foreground" />
				<code className="text-xs font-medium bg-muted px-1.5 py-0.5 rounded">
					{input.task_id}
				</code>
				{input.block && (
					<Badge variant="secondary" className="text-xs">
						Blocking
					</Badge>
				)}
				{input.timeout && (
					<span className="text-xs text-muted-foreground">
						timeout: {(input.timeout / 1000).toFixed(0)}s
					</span>
				)}
			</div>

			{/* Result status */}
			{result && (
				<div className="space-y-2">
					{/* Status indicator */}
					<div className="flex items-center gap-2">
						{result.status === "timeout" ? (
							<>
								<Clock className="h-4 w-4 text-yellow-500" />
								<span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
									Timeout - Agent still running
								</span>
							</>
						) : result.taskStatus === "running" ? (
							<>
								<Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
								<span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
									Running
								</span>
							</>
						) : result.taskStatus === "completed" ? (
							<>
								<CheckCircle2 className="h-4 w-4 text-green-500" />
								<span className="text-sm text-green-600 dark:text-green-400 font-medium">
									Completed
								</span>
							</>
						) : (
							<>
								<AlertTriangle className="h-4 w-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									Unknown status
								</span>
							</>
						)}
					</div>

					{/* Task description */}
					{result.description && (
						<p className="text-xs text-muted-foreground">
							{result.description}
						</p>
					)}

					{/* Output summary */}
					{result.output && (
						<div>
							<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
								Agent Activity
							</h4>
							<div className="bg-background/50 p-2 rounded-md border text-xs max-h-48 overflow-y-auto">
								{formatAgentOutput(result.output)}
							</div>
						</div>
					)}

					{/* Final result */}
					{result.finalResult && (
						<div>
							<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
								Result
							</h4>
							<pre className="text-xs bg-background/50 p-2 rounded-md border overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
								{result.finalResult}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function formatTaskOutputSummary(
	input: TaskOutputInput,
	toolResult: ToolResultContent | undefined,
): string {
	const result = parseTaskOutputResult(toolResult);

	const label = result?.description || input.task_id;
	const truncatedLabel = label.length > 40 ? `${label.slice(0, 40)}...` : label;

	if (!result) return truncatedLabel;

	if (result.status === "timeout") {
		return `${truncatedLabel} ...`;
	}
	if (result.taskStatus === "running") {
		return `${truncatedLabel} ...`;
	}
	if (result.taskStatus === "completed") {
		return `${truncatedLabel} done`;
	}
	return truncatedLabel;
}

interface ParsedResult {
	status?: "timeout" | "success";
	taskStatus?: "running" | "completed";
	description?: string;
	output?: string;
	finalResult?: string;
}

function parseTaskOutputResult(
	toolResult: ToolResultContent | undefined,
): ParsedResult | null {
	if (!toolResult) return null;

	const content = toolResult.content;

	if (typeof content === "string") {
		const isTimeout = content.includes("timeout");
		const isRunning = content.includes("running");
		const isCompleted = content.includes("completed");

		return {
			status: isTimeout ? "timeout" : "success",
			taskStatus: isRunning ? "running" : isCompleted ? "completed" : undefined,
			output: content,
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

		return parseTaskOutputResult({ ...toolResult, content: text });
	}

	if (typeof content === "object" && content !== null) {
		const obj = content as unknown as TaskOutputResult;
		return {
			status: obj.retrieval_status,
			taskStatus: obj.task?.status,
			description: obj.task?.description,
			output: obj.task?.output,
			finalResult: obj.task?.result,
		};
	}

	return null;
}

function formatAgentOutput(output: string): React.ReactNode {
	const lines = output.split("\n").filter((line) => line.trim());

	if (lines.length === 0) return output;

	const toolCallPattern = /\[Tool:\s*(\w+)\]\s*(\{.*\})/;
	const hasToolCalls = lines.some((line) => toolCallPattern.test(line));

	if (!hasToolCalls) {
		return <pre className="whitespace-pre-wrap font-mono">{output}</pre>;
	}

	return (
		<div className="space-y-1 font-mono">
			{lines.map((line) => {
				const match = line.match(toolCallPattern);
				if (match) {
					const [, toolName, params] = match;
					return (
						<div key={line} className="flex items-start gap-1.5">
							<span className="text-purple-600 dark:text-purple-400 flex-shrink-0">
								{toolName}
							</span>
							<span className="text-muted-foreground truncate">{params}</span>
						</div>
					);
				}
				return (
					<div key={line} className="text-muted-foreground">
						{line}
					</div>
				);
			})}
		</div>
	);
}
