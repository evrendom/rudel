import {
	Bot,
	ChevronDown,
	Eye,
	FileOutput,
	FilePlus,
	FileText,
	ListTodo,
	Terminal,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
	Conversation,
	ToolResultContent,
} from "@/lib/conversation-schema";
import { BashContent, formatBashSummary } from "./BashContent";
import { formatReadSummary, ReadContent } from "./ReadContent";
import { SubAgentDrawer } from "./SubAgentDrawer";
import { formatTaskSummary, TaskContent } from "./TaskContent";
import {
	formatTaskOutputSummary,
	TaskOutputContent,
} from "./TaskOutputContent";
import { parseTodoWriteInput, TodoWriteContent } from "./TodoWriteContent";
import { formatWriteSummary, WriteContent } from "./WriteContent";

interface ToolUseBlockProps {
	block: {
		id: string;
		name: string;
		input: Record<string, unknown>;
	};
	toolResult: ToolResultContent | undefined;
	subagents: Map<string, Array<Conversation>>;
}

export function ToolUseBlock({
	block,
	toolResult,
	subagents,
}: ToolUseBlockProps) {
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [showRawJson, setShowRawJson] = useState(false);

	// Tool type detection
	const toolName = block.name;
	const isTaskTool = toolName === "Task" && Boolean(block.input.subagent_type);
	const isTodoWriteTool = toolName === "TodoWrite";
	const isBashTool = toolName === "Bash";
	const isReadTool = toolName === "Read";
	const isWriteTool = toolName === "Write";
	const isTaskOutputTool = toolName === "TaskOutput";

	// Check if this tool has specialized visualization
	const hasSpecializedView =
		isTodoWriteTool ||
		isTaskTool ||
		isBashTool ||
		isReadTool ||
		isWriteTool ||
		isTaskOutputTool;

	const todos = isTodoWriteTool ? parseTodoWriteInput(block.input) : null;

	// Get subagent conversations if this is a Task tool
	const agentId = extractAgentIdFromResult(toolResult);
	const subagentConversations = agentId ? subagents.get(agentId) : undefined;

	// Format the summary based on tool type
	const summary = formatToolSummary(block.name, block.input, toolResult, todos);

	// Get the appropriate icon for the tool
	const ToolIcon = getToolIcon(toolName);

	return (
		<>
			<div className="border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 rounded-md">
				<Collapsible>
					<div className="flex items-center">
						<CollapsibleTrigger asChild>
							<div className="flex-1 cursor-pointer hover:bg-green-100/50 dark:hover:bg-green-900/30 px-2 py-1 group">
								<div className="flex items-center gap-1.5">
									<ToolIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
									<span className="text-xs font-medium flex-shrink-0">
										{block.name}
									</span>
									<span className="text-xs text-muted-foreground truncate">
										({summary})
									</span>
									<ChevronDown className="h-3 w-3 ml-auto transition-transform group-data-[state=open]:rotate-180 text-muted-foreground flex-shrink-0" />
								</div>
							</div>
						</CollapsibleTrigger>

						{isTaskTool && (
							<div className="flex-shrink-0 border-l border-green-200 dark:border-green-800">
								<Button
									variant="ghost"
									size="sm"
									className="h-full px-2 py-1 rounded-none hover:bg-green-100 dark:hover:bg-green-900/30 text-xs"
									onClick={() => setDrawerOpen(true)}
								>
									<Eye className="h-3 w-3 mr-1" />
									View
								</Button>
							</div>
						)}
					</div>

					<CollapsibleContent>
						<div className="px-2 pb-2 space-y-2">
							{/* Specialized tool visualizations */}
							{isBashTool ? (
								<BashContent
									input={
										block.input as {
											command: string;
											description?: string;
										}
									}
									toolResult={toolResult}
								/>
							) : isReadTool ? (
								<ReadContent
									input={
										block.input as {
											file_path: string;
											offset?: number;
											limit?: number;
										}
									}
									toolResult={toolResult}
								/>
							) : isWriteTool ? (
								<WriteContent
									input={
										block.input as {
											file_path: string;
											content: string;
										}
									}
									toolResult={toolResult}
								/>
							) : isTaskTool ? (
								<TaskContent
									input={
										block.input as {
											subagent_type: string;
											description: string;
											prompt: string;
											run_in_background?: boolean;
											model?: string;
										}
									}
									toolResult={toolResult}
								/>
							) : isTaskOutputTool ? (
								<TaskOutputContent
									input={
										block.input as {
											task_id: string;
											block?: boolean;
											timeout?: number;
										}
									}
									toolResult={toolResult}
								/>
							) : isTodoWriteTool && todos ? (
								<TodoWriteContent todos={todos} />
							) : (
								/* Default: raw JSON view */
								<>
									<div>
										<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
											Input
										</h4>
										<pre className="text-xs bg-background/50 p-1.5 rounded border overflow-x-auto">
											{JSON.stringify(block.input, null, 2)}
										</pre>
									</div>
									{toolResult && (
										<div>
											<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
												Result
											</h4>
											<pre className="text-xs bg-background/50 p-1.5 rounded border overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
												{typeof toolResult.content === "string"
													? toolResult.content
													: JSON.stringify(toolResult.content, null, 2)}
											</pre>
										</div>
									)}
								</>
							)}

							{/* Raw JSON toggle for specialized views */}
							{hasSpecializedView && (
								<>
									<button
										type="button"
										onClick={() => setShowRawJson(!showRawJson)}
										className="text-xs text-muted-foreground hover:text-foreground underline"
									>
										{showRawJson ? "Hide" : "Show"} raw JSON
									</button>
									{showRawJson && (
										<div className="space-y-2">
											<div>
												<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
													Input
												</h4>
												<pre className="text-xs bg-background/50 p-1.5 rounded border overflow-x-auto">
													{JSON.stringify(block.input, null, 2)}
												</pre>
											</div>
											{toolResult && (
												<div>
													<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
														Result
													</h4>
													<pre className="text-xs bg-background/50 p-1.5 rounded border overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
														{typeof toolResult.content === "string"
															? toolResult.content
															: JSON.stringify(toolResult.content, null, 2)}
													</pre>
												</div>
											)}
										</div>
									)}
								</>
							)}
						</div>
					</CollapsibleContent>
				</Collapsible>
			</div>

			{isTaskTool && (
				<SubAgentDrawer
					open={drawerOpen}
					onOpenChange={setDrawerOpen}
					subagentType={block.input.subagent_type as string}
					description={block.input.description as string}
					conversations={subagentConversations}
				/>
			)}
		</>
	);
}

interface Todo {
	content: string;
	status: "pending" | "in_progress" | "completed";
}

function formatToolSummary(
	toolName: string,
	input: Record<string, unknown>,
	toolResult: ToolResultContent | undefined,
	todos: Array<Todo> | null,
): string {
	switch (toolName) {
		case "Bash":
			return formatBashSummary(
				input as { command: string; description?: string },
			);
		case "Read":
			return formatReadSummary(
				input as {
					file_path: string;
					offset?: number;
					limit?: number;
				},
			);
		case "Write":
			return formatWriteSummary(
				input as { file_path: string; content: string },
			);
		case "Task":
			return formatTaskSummary(
				input as {
					subagent_type: string;
					description: string;
					prompt: string;
				},
			);
		case "TaskOutput":
			return formatTaskOutputSummary(
				input as { task_id: string; block?: boolean; timeout?: number },
				toolResult,
			);
		case "TodoWrite":
			if (todos) {
				return `${todos.filter((t) => t.status === "completed").length}/${todos.length} completed`;
			}
			return formatDefaultToolInput(input);
		default:
			return formatDefaultToolInput(input);
	}
}

function formatDefaultToolInput(input: Record<string, unknown>): string {
	const entries = Object.entries(input).slice(0, 2);
	return entries
		.map(([key, value]) => {
			const str = typeof value === "string" ? value : JSON.stringify(value);
			const truncated = str.length > 30 ? `${str.slice(0, 30)}...` : str;
			return `${key}=${truncated}`;
		})
		.join(", ");
}

function getToolIcon(
	toolName: string,
): React.ComponentType<{ className?: string }> {
	switch (toolName) {
		case "Bash":
			return Terminal;
		case "Read":
			return FileText;
		case "Write":
			return FilePlus;
		case "Task":
			return Bot;
		case "TaskOutput":
			return FileOutput;
		case "TodoWrite":
			return ListTodo;
		default:
			return Wrench;
	}
}

function extractAgentIdFromResult(
	toolResult: ToolResultContent | undefined,
): string | undefined {
	if (!toolResult) return undefined;

	const content = toolResult.content;
	const text =
		typeof content === "string"
			? content
			: Array.isArray(content)
				? content
						.filter((block) => block.type === "text")
						.map((block) => block.text)
						.join("\n")
				: "";

	const match = text.match(/agentId:\s*([a-f0-9]+)/i);
	return match?.[1];
}
