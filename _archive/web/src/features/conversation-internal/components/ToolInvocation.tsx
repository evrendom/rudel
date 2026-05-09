import { AlertCircle, ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";

interface ToolInvocationProps {
	toolName: string;
	input: Record<string, unknown>;
	result?: {
		content: string | Array<{ type: string; text?: string; source?: unknown }>;
		is_error?: boolean;
	};
	className?: string;
}

export function ToolInvocation({
	toolName,
	input,
	result,
	className,
}: ToolInvocationProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	// Format input for display
	const formatInput = () => {
		const keys = Object.keys(input);
		if (keys.length === 0) return "No parameters";

		const important = keys.slice(0, 2);
		const summary = important
			.map((key) => {
				const value = input[key];
				if (typeof value === "string" && value.length > 50) {
					return `${key}: "${value.slice(0, 50)}..."`;
				}
				if (typeof value === "string") {
					return `${key}: "${value}"`;
				}
				return `${key}: ${JSON.stringify(value)}`;
			})
			.join(", ");

		return keys.length > 2 ? `${summary}, +${keys.length - 2} more` : summary;
	};

	// Format result content
	const getResultContent = (): string => {
		if (!result) return "";

		if (typeof result.content === "string") {
			return result.content;
		}

		if (Array.isArray(result.content)) {
			return result.content
				.map((item) => item.text || JSON.stringify(item))
				.join("\n");
		}

		return JSON.stringify(result.content, null, 2);
	};

	const hasResult = result?.content;
	const isError = result?.is_error;

	return (
		<div
			className={cn(
				"border rounded-lg overflow-hidden",
				isError
					? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
					: "border-border bg-muted/30",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors min-w-0"
			>
				{isExpanded ? (
					<ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
				) : (
					<ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
				)}
				{isError ? (
					<AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
				) : (
					<Terminal className="w-4 h-4 text-blue-500 flex-shrink-0" />
				)}
				<span
					className={cn(
						"font-mono text-sm font-semibold",
						isError ? "text-red-700 dark:text-red-300" : "text-foreground",
					)}
				>
					{toolName}
				</span>
				<span className="text-xs text-muted-foreground truncate flex-1">
					{formatInput()}
				</span>
			</button>

			{isExpanded && (
				<div className="px-4 pb-4 space-y-3">
					{/* Tool Input */}
					<div>
						<h4 className="text-xs font-semibold text-muted-foreground mb-2">
							Input Parameters
						</h4>
						<CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
					</div>

					{/* Tool Result */}
					{hasResult && (
						<div>
							<h4
								className={cn(
									"text-xs font-semibold mb-2",
									isError
										? "text-red-700 dark:text-red-300"
										: "text-muted-foreground",
								)}
							>
								{isError ? "Error Output" : "Output"}
							</h4>
							<CodeBlock
								code={getResultContent()}
								language="text"
								className={
									isError
										? "border-2 border-red-300 dark:border-red-800"
										: undefined
								}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
