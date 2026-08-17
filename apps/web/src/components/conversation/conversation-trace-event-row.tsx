import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CodeBlock, type CodeLineKind } from "./CodeBlock";
import {
	formatShellOutput,
	formatToolInputPreview,
	getDelegatedModel,
	getShellCommand,
	getToolPresentation,
	getToolPrimaryArg,
	normalizeToolOutput,
} from "./conversation-tools";
import {
	compactPreview,
	type TraceEvent,
	type TraceSkillContent,
	type TraceToolResult,
	toolResultText,
} from "./conversation-trace";
import {
	conversationTraceLabelClassName,
	conversationTracePreviewClassName,
	conversationTraceProsePreviewClassName,
} from "./conversation-trace-class-names";
import {
	TraceBrainIcon,
	TraceMessageIcon,
	TraceWrenchIcon,
} from "./conversation-trace-hugeicons";
import { ModelTraceIcon, TraceIcon } from "./conversation-trace-icons";
import { ConversationTraceTag } from "./conversation-trace-tag";
import { CONVERSATION_TOOL_ICONS } from "./conversation-trace-tool-icons";
import { ExpandableTraceRow } from "./expandable-trace-row";
import { MessageContent } from "./MessageContent";

export function ToolResultBody({ result }: { result: TraceToolResult }) {
	const text = toolResultText(result.content);
	const output = formatShellOutput(text || "No output");

	return (
		<CodeBlock
			code={output.text}
			filename={result.isError ? "Error Output" : "Output"}
			language={output.language}
			showLineNumbers
		/>
	);
}

function formatToolInputBody(input: Record<string, unknown>) {
	if (Object.keys(input).length === 0) {
		return undefined;
	}

	try {
		return JSON.stringify(input, null, 2);
	} catch {
		return undefined;
	}
}

function getFilePresentation(input: Record<string, unknown>) {
	const filePath = input.file_path;
	if (typeof filePath !== "string" || filePath.trim() === "") {
		return undefined;
	}

	const normalizedPath = filePath.trim();
	const filename = normalizedPath.split("/").filter(Boolean).at(-1);
	if (!filename) {
		return undefined;
	}

	const extension = filename.split(".").at(-1)?.toLowerCase();
	const languageByExtension: Record<string, string> = {
		cjs: "javascript",
		cts: "typescript",
		js: "javascript",
		jsx: "jsx",
		json: "json",
		jsonl: "json",
		md: "markdown",
		mjs: "javascript",
		mts: "typescript",
		py: "python",
		sh: "bash",
		ts: "typescript",
		tsx: "tsx",
		yaml: "yaml",
		yml: "yaml",
	};

	return {
		filename,
		language: extension
			? (languageByExtension[extension] ?? extension)
			: "text",
	};
}

function getRenderedLines(content: string) {
	const normalizedContent = content.trim();
	return normalizedContent === "" ? [] : normalizedContent.split("\n");
}

function countRenderedLines(content: string) {
	return getRenderedLines(content).length;
}

function repeatLineKind(kind: CodeLineKind, count: number): CodeLineKind[] {
	return Array.from({ length: count }, () => kind);
}

export function ShellToolCallBody({
	command,
	result,
}: {
	command: string;
	result: TraceToolResult | undefined;
}) {
	const resultText = result ? toolResultText(result.content) : undefined;
	const rawOutputText =
		resultText || (result ? "No output" : "No result recorded for this call.");
	const output = formatShellOutput(rawOutputText);

	return (
		<div className="grid gap-3" data-trace-shell-command-details>
			<CodeBlock code={command} filename="Input" language="bash" />
			<CodeBlock
				code={output.text}
				filename="Output"
				language={output.language}
				showLineNumbers
			/>
		</div>
	);
}

export function SkillToolCallBody({
	skillContent,
}: {
	skillContent: TraceSkillContent;
}) {
	return (
		<div data-trace-skill-details>
			<CodeBlock
				code={skillContent.content}
				filename="SKILL.md"
				language="markdown"
				showLineNumbers
			/>
		</div>
	);
}

export function ToolCallBody({
	input,
	result,
	toolName,
}: {
	input: Record<string, unknown>;
	result: TraceToolResult | undefined;
	toolName: string;
}) {
	const inputText = formatToolInputBody(input);
	const resultText = result ? toolResultText(result.content) : undefined;
	const unnormalizedOutputText =
		resultText || (result ? "No output" : "No result recorded for this call.");
	const rawOutputText = normalizeToolOutput(toolName, unnormalizedOutputText);
	const filePresentation = getFilePresentation(input);
	const writeContent = input.content;
	const oldString = input.old_string;
	const newString = input.new_string;

	if (
		toolName === "Edit" &&
		filePresentation &&
		typeof oldString === "string" &&
		typeof newString === "string"
	) {
		const oldLines = getRenderedLines(oldString);
		const newLines = getRenderedLines(newString);
		const lineChangeKinds = [
			...repeatLineKind("deletion", oldLines.length),
			...repeatLineKind("addition", newLines.length),
		];

		return (
			<CodeBlock
				changeSummary={{
					additions: newLines.length,
					deletions: oldLines.length,
				}}
				code={[...oldLines, ...newLines].join("\n")}
				filename={filePresentation.filename}
				language={filePresentation.language}
				lineChangeKinds={lineChangeKinds}
				showLineNumbers
			/>
		);
	}

	if (
		toolName === "Write" &&
		filePresentation &&
		typeof writeContent === "string"
	) {
		return (
			<CodeBlock
				changeSummary={{
					additions: countRenderedLines(writeContent),
					deletions: 0,
				}}
				code={writeContent}
				filename={filePresentation.filename}
				language={filePresentation.language}
				lineChangeKind="addition"
				showLineNumbers
			/>
		);
	}

	if (toolName === "Read" && filePresentation) {
		return (
			<CodeBlock
				code={rawOutputText}
				filename={filePresentation.filename}
				language={filePresentation.language}
				showLineNumbers
			/>
		);
	}

	const output = formatShellOutput(rawOutputText);

	return (
		<div className="grid gap-3" data-trace-tool-details>
			{inputText ? (
				<CodeBlock code={inputText} filename="Input" language="json" />
			) : null}
			<CodeBlock
				code={output.text}
				filename={result?.isError ? "Error Output" : "Output"}
				language={output.language}
				showLineNumbers
			/>
		</div>
	);
}

export function ConversationTraceEventRow({
	event,
	trailing,
}: {
	event: TraceEvent;
	trailing?: ReactNode;
}) {
	if (event.kind === "reasoning") {
		const collapsedPreviewText = compactPreview(
			event.text,
			Number.POSITIVE_INFINITY,
		);
		return (
			<ExpandableTraceRow
				compact
				collapsedBody={
					<p
						className={conversationTraceProsePreviewClassName}
						data-trace-preview
					>
						{collapsedPreviewText}
					</p>
				}
				fullPreviewText={event.text}
				label={<p className={conversationTraceLabelClassName}>Reasoning</p>}
				leading={<TraceIcon icon={TraceBrainIcon} tone="violet" />}
				trailing={trailing}
				treeBodyClassName="-ml-3"
				body={
					<p className="whitespace-pre-wrap font-sans text-[0.8125rem] leading-5 font-normal tracking-normal text-[color:var(--dashboardy-heading)] text-pretty">
						{event.text}
					</p>
				}
			/>
		);
	}

	if (event.kind === "message") {
		const collapsedPreviewText = compactPreview(
			event.text,
			Number.POSITIVE_INFINITY,
		);
		return (
			<ExpandableTraceRow
				compact
				collapsedBody={
					collapsedPreviewText ? (
						<p
							className={conversationTraceProsePreviewClassName}
							data-trace-preview
						>
							{collapsedPreviewText}
						</p>
					) : undefined
				}
				fullPreviewText={event.text || undefined}
				label={<p className={conversationTraceLabelClassName}>Message</p>}
				leading={<TraceIcon icon={TraceMessageIcon} tone="blue" />}
				trailing={trailing}
				treeBodyClassName="-ml-3"
				body={<MessageContent content={event.content} />}
			/>
		);
	}

	if (event.kind === "orphan-result") {
		const resultText = toolResultText(event.result.content);
		return (
			<ExpandableTraceRow
				compact
				fullPreviewText={resultText}
				label={<p className={conversationTraceLabelClassName}>Result</p>}
				leading={
					<TraceIcon
						icon={TraceWrenchIcon}
						tone={event.result.isError ? "tomato" : "cyan"}
					/>
				}
				trailing={trailing}
				treeBodyClassName="-ml-3"
				body={<ToolResultBody result={event.result} />}
			>
				<p className={conversationTracePreviewClassName} data-trace-preview>
					{compactPreview(resultText)}
				</p>
			</ExpandableTraceRow>
		);
	}

	const { verb, icon } = getToolPresentation(event.toolName);
	const primaryArg = getToolPrimaryArg(event.toolName, event.input);
	const hasFileTag =
		primaryArg !== undefined &&
		(typeof event.input.file_path === "string" ||
			typeof event.input.notebook_path === "string");
	const inputPreview = hasFileTag
		? undefined
		: formatToolInputPreview(event.input);
	const isError = event.result?.isError === true;
	const shellCommand = getShellCommand(event.toolName, event.input);
	const delegatedModel = getDelegatedModel(event.toolName, event.input);
	const isSkill = event.toolName.toLowerCase() === "skill";

	if (shellCommand) {
		return (
			<ExpandableTraceRow
				compact
				fullPreviewText={undefined}
				label={
					<ConversationTraceTag
						className="min-w-0 max-w-[36rem] shrink pl-1.5"
						data-trace-shell-command-tag
						hideIcon
						title={shellCommand}
						toolIcon={icon}
						value={shellCommand}
					>
						<code
							className="min-w-0 truncate whitespace-pre font-mono font-normal tracking-normal [font-variant-ligatures:none]"
							data-trace-preview
							data-trace-shell-command-preview
						>
							{compactPreview(shellCommand, Number.POSITIVE_INFINITY)}
						</code>
					</ConversationTraceTag>
				}
				leading={
					<TraceIcon
						className={
							isError
								? "border-[color:var(--dashboardy-danger-foreground)] text-[color:var(--dashboardy-danger-foreground)]"
								: undefined
						}
						icon={CONVERSATION_TOOL_ICONS.terminal}
						toolIcon="terminal"
						tone={isError ? "tomato" : "amber"}
					/>
				}
				trailing={trailing}
				treeBodyClassName="-ml-3"
				body={
					<ShellToolCallBody command={shellCommand} result={event.result} />
				}
			/>
		);
	}

	if (isSkill) {
		const skillName = primaryArg ?? "Skill";

		return (
			<ExpandableTraceRow
				compact
				fullPreviewText={undefined}
				label={
					<ConversationTraceTag
						className="max-w-[18rem] shrink-0"
						data-trace-skill-tag
						toolIcon={icon}
						value={skillName}
					>
						<span className="truncate">{skillName}</span>
					</ConversationTraceTag>
				}
				leading={
					<TraceIcon
						className={
							isError
								? "border-[color:var(--dashboardy-danger-foreground)] text-[color:var(--dashboardy-danger-foreground)]"
								: undefined
						}
						icon={CONVERSATION_TOOL_ICONS[icon]}
						toolIcon={icon}
						tone={isError ? "tomato" : "amber"}
					/>
				}
				trailing={trailing}
				treeBodyClassName="-ml-3"
				body={
					event.skillContent ? (
						<SkillToolCallBody skillContent={event.skillContent} />
					) : (
						<ToolCallBody
							input={event.input}
							result={event.result}
							toolName={event.toolName}
						/>
					)
				}
			/>
		);
	}

	return (
		<ExpandableTraceRow
			compact
			fullPreviewText={undefined}
			label={
				<span
					className="flex min-w-0 items-center gap-1"
					data-trace-tool-label-group
				>
					<p className={conversationTraceLabelClassName}>{verb}</p>
					{primaryArg ? (
						<ConversationTraceTag
							className="max-w-[18rem] shrink-0"
							model={delegatedModel}
							toolIcon={icon}
							value={primaryArg}
						>
							<span className="truncate">{primaryArg}</span>
						</ConversationTraceTag>
					) : null}
				</span>
			}
			leading={
				delegatedModel ? (
					<ModelTraceIcon
						expanded={false}
						expandable={false}
						model={delegatedModel}
					/>
				) : (
					<TraceIcon
						className={
							isError
								? "border-[color:var(--dashboardy-danger-foreground)] text-[color:var(--dashboardy-danger-foreground)]"
								: undefined
						}
						icon={CONVERSATION_TOOL_ICONS[icon]}
						toolIcon={icon}
						tone={isError ? "tomato" : "amber"}
					/>
				)
			}
			trailing={trailing}
			treeBodyClassName="-ml-3"
			body={
				<ToolCallBody
					input={event.input}
					result={event.result}
					toolName={event.toolName}
				/>
			}
		>
			{inputPreview ? (
				<p
					className={cn(
						conversationTracePreviewClassName,
						"font-mono text-[0.75rem]",
					)}
					data-trace-preview
				>
					{inputPreview}
				</p>
			) : null}
		</ExpandableTraceRow>
	);
}
