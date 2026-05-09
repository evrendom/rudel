import {
	File,
	FileCode,
	FileJson,
	FilePlus,
	FileText,
	FileType,
} from "lucide-react";
import type { ToolResultContent } from "@/lib/conversation-schema";

interface WriteInput {
	file_path: string;
	content: string;
}

interface WriteContentProps {
	input: WriteInput;
	toolResult: ToolResultContent | undefined;
}

export function WriteContent({ input, toolResult }: WriteContentProps) {
	const fileName = getFileName(input.file_path);
	const extension = getExtension(input.file_path);
	const FileIcon = getFileIcon(extension);
	const stats = getContentStats(input.content);
	const isSuccess = !toolResult?.is_error;

	return (
		<div className="space-y-2">
			{/* File path with stats */}
			<div className="flex items-center gap-2">
				<div className="relative">
					<FileIcon className="h-4 w-4 text-muted-foreground" />
					<FilePlus className="h-2.5 w-2.5 text-green-500 absolute -bottom-0.5 -right-0.5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium">{fileName}</span>
						<span className="text-xs text-muted-foreground">
							{stats.lines} lines &middot; {stats.size}
						</span>
					</div>
					<span className="text-xs text-muted-foreground truncate block">
						{formatPath(input.file_path)}
					</span>
				</div>
			</div>

			{/* Content preview */}
			<div>
				<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
					Content
				</h4>
				<pre className="text-xs bg-background/50 p-2 rounded-md border overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
					{input.content}
				</pre>
			</div>

			{/* Result status */}
			{toolResult && (
				<div className="text-xs">
					{isSuccess ? (
						<span className="text-green-600 dark:text-green-400">
							File written successfully
						</span>
					) : (
						<span className="text-red-500">
							{typeof toolResult.content === "string"
								? toolResult.content
								: "Failed to write file"}
						</span>
					)}
				</div>
			)}
		</div>
	);
}

export function formatWriteSummary(input: WriteInput): string {
	const fileName = getFileName(input.file_path);
	const stats = getContentStats(input.content);
	return `${fileName} (${stats.lines} lines)`;
}

function getContentStats(content: string): { lines: number; size: string } {
	const lines = content.split("\n").length;
	const bytes = new TextEncoder().encode(content).length;

	let size: string;
	if (bytes < 1024) {
		size = `${bytes} B`;
	} else if (bytes < 1024 * 1024) {
		size = `${(bytes / 1024).toFixed(1)} KB`;
	} else {
		size = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	return { lines, size };
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
