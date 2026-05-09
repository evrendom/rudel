import { CheckCircle2, Terminal, XCircle } from "lucide-react";
import type { ToolResultContent } from "@/lib/conversation-schema";

interface BashInput {
	command: string;
	description?: string;
	timeout?: number;
	run_in_background?: boolean;
}

interface BashResult {
	stdout?: string;
	stderr?: string;
	interrupted?: boolean;
	isImage?: boolean;
}

interface BashContentProps {
	input: BashInput;
	toolResult: ToolResultContent | undefined;
}

export function BashContent({ input, toolResult }: BashContentProps) {
	const result = parseBashResult(toolResult);
	const isError = result?.isError ?? false;
	const exitCode = result?.exitCode;

	return (
		<div className="space-y-2">
			{/* Command */}
			<div>
				<h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
					<Terminal className="h-3 w-3" />
					Command
				</h4>
				<div className="bg-zinc-900 dark:bg-zinc-950 rounded-md p-2 font-mono text-xs text-zinc-100 overflow-x-auto">
					<span className="text-green-400 select-none">$ </span>
					{input.command}
				</div>
			</div>

			{/* Description */}
			{input.description && (
				<p className="text-xs text-muted-foreground italic">
					{input.description}
				</p>
			)}

			{/* Result */}
			{result && (
				<div className="space-y-2">
					{/* Exit status */}
					<div className="flex items-center gap-1.5 text-xs">
						{isError ? (
							<>
								<XCircle className="h-3.5 w-3.5 text-red-500" />
								<span className="text-red-500 font-medium">
									{exitCode !== undefined ? `Exit code ${exitCode}` : "Error"}
								</span>
							</>
						) : (
							<>
								<CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
								<span className="text-green-500 font-medium">Success</span>
							</>
						)}
						{result.interrupted && (
							<span className="text-yellow-500 ml-2">(interrupted)</span>
						)}
					</div>

					{/* stdout */}
					{result.stdout && (
						<div>
							<h4 className="text-xs font-medium text-muted-foreground mb-0.5">
								Output
							</h4>
							<pre className="text-xs bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-2 rounded-md overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
								{result.stdout}
							</pre>
						</div>
					)}

					{/* stderr */}
					{result.stderr && (
						<div>
							<h4 className="text-xs font-medium text-red-400 mb-0.5">
								Error Output
							</h4>
							<pre className="text-xs bg-red-950/50 text-red-200 p-2 rounded-md overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto font-mono border border-red-900/50">
								{result.stderr}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function formatBashSummary(input: BashInput): string {
	const cmd = input.command;

	if (input.description) {
		return input.description;
	}

	return cmd.length > 60 ? `${cmd.slice(0, 60)}...` : cmd;
}

function parseBashResult(
	toolResult: ToolResultContent | undefined,
): (BashResult & { isError: boolean; exitCode?: number }) | null {
	if (!toolResult) return null;

	const content = toolResult.content;

	if (typeof content === "string") {
		const exitMatch = content.match(/Exit code (\d+)/);
		const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : undefined;
		const isError =
			toolResult.is_error || (exitCode !== undefined && exitCode !== 0);

		return {
			stdout: isError ? undefined : content,
			stderr: isError ? content : undefined,
			isError,
			exitCode,
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

		const exitMatch = text.match(/Exit code (\d+)/);
		const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : undefined;
		const isError =
			toolResult.is_error || (exitCode !== undefined && exitCode !== 0);

		return {
			stdout: isError ? undefined : text,
			stderr: isError ? text : undefined,
			isError,
			exitCode,
		};
	}

	if (typeof content === "object" && content !== null) {
		const obj = content as unknown as BashResult;
		const hasStderr = Boolean(obj.stderr);
		const isError = toolResult.is_error || hasStderr;

		return {
			stdout: obj.stdout,
			stderr: obj.stderr,
			interrupted: obj.interrupted,
			isImage: obj.isImage,
			isError,
		};
	}

	return null;
}
