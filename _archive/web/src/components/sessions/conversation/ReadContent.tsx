import { File, FileCode, FileJson, FileText, FileType } from "lucide-react";
import type { ToolResultContent } from "@/lib/conversation-schema";

interface ReadInput {
	file_path: string;
	offset?: number;
	limit?: number;
}

interface ReadContentProps {
	input: ReadInput;
	toolResult: ToolResultContent | undefined;
}

export function ReadContent({ input, toolResult }: ReadContentProps) {
	const result = parseReadResult(toolResult);
	const fileName = getFileName(input.file_path);
	const extension = getExtension(input.file_path);
	const FileIcon = getFileIcon(extension);

	return (
		<div className="space-y-2">
			{/* File path */}
			<div className="flex items-center gap-2">
				<FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
				<div className="min-w-0">
					<span className="text-xs font-medium">{fileName}</span>
					<span className="text-xs text-muted-foreground ml-1 truncate block">
						{formatPath(input.file_path)}
					</span>
				</div>
			</div>

			{/* Range indicator */}
			{(input.offset || input.limit) && (
				<p className="text-xs text-muted-foreground">
					{input.offset && `from line ${input.offset}`}
					{input.offset && input.limit && ", "}
					{input.limit && `${input.limit} lines`}
				</p>
			)}

			{/* Content preview */}
			{result && (
				<div>
					<div className="flex items-center justify-between mb-0.5">
						<h4 className="text-xs font-medium text-muted-foreground">
							Content
							{result.lineCount && (
								<span className="font-normal ml-1">
									({result.lineCount} lines)
								</span>
							)}
						</h4>
					</div>
					{result.error ? (
						<div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded-md border border-red-200 dark:border-red-900">
							{result.error}
						</div>
					) : (
						<pre className="text-xs bg-background/50 p-2 rounded-md border overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
							{result.preview}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}

export function formatReadSummary(input: ReadInput): string {
	const fileName = getFileName(input.file_path);
	if (input.offset || input.limit) {
		const parts = [];
		if (input.offset) parts.push(`from ${input.offset}`);
		if (input.limit) parts.push(`${input.limit} lines`);
		return `${fileName} (${parts.join(", ")})`;
	}
	return fileName;
}

function parseReadResult(
	toolResult: ToolResultContent | undefined,
): { preview: string; lineCount?: number; error?: string } | null {
	if (!toolResult) return null;

	const content = toolResult.content;

	let text: string;
	if (typeof content === "string") {
		text = content;
	} else if (Array.isArray(content)) {
		text = content
			.filter(
				(block): block is { type: "text"; text: string } =>
					block.type === "text",
			)
			.map((block) => block.text)
			.join("\n");
	} else {
		return null;
	}

	if (toolResult.is_error) {
		return { preview: "", error: text };
	}

	const lines = text.split("\n").filter((line) => line.trim());
	const lineCount = lines.length;

	return {
		preview: text,
		lineCount,
	};
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

function getExtension(path: string): string {
	const fileName = getFileName(path);
	const parts = fileName.split(".");
	return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
}

function formatPath(path: string): string {
	const prefixes = ["/Users/", "/home/", "/var/", "/tmp/"];
	for (const prefix of prefixes) {
		if (path.startsWith(prefix)) {
			const withoutPrefix = path.slice(prefix.length);
			const slashIndex = withoutPrefix.indexOf("/");
			if (slashIndex !== -1) {
				return `~${withoutPrefix.slice(slashIndex)}`;
			}
		}
	}
	return path;
}

function getFileIcon(
	extension: string,
): React.ComponentType<{ className?: string }> {
	const codeExtensions = [
		"ts",
		"tsx",
		"js",
		"jsx",
		"py",
		"rb",
		"go",
		"rs",
		"java",
		"c",
		"cpp",
		"h",
		"hpp",
		"cs",
		"swift",
		"kt",
		"scala",
		"vue",
		"svelte",
	];
	const jsonExtensions = ["json", "jsonl", "json5"];
	const textExtensions = ["md", "mdx", "txt", "rst", "adoc"];
	const configExtensions = ["yaml", "yml", "toml", "ini", "conf", "env"];

	if (codeExtensions.includes(extension)) return FileCode;
	if (jsonExtensions.includes(extension)) return FileJson;
	if (textExtensions.includes(extension)) return FileText;
	if (configExtensions.includes(extension)) return FileType;
	return File;
}
