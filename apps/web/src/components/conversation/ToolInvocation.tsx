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
				"overflow-hidden rounded-[1rem] border",
				isError
					? "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-danger-surface)]"
					: "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex min-w-0 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)]"
			>
				{isExpanded ? (
					<ChevronDown className="size-4 shrink-0 text-[color:var(--dashboardy-muted)]" />
				) : (
					<ChevronRight className="size-4 shrink-0 text-[color:var(--dashboardy-muted)]" />
				)}
				<div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]">
					{isError ? (
						<AlertCircle className="size-4 text-[color:var(--dashboardy-danger-foreground)]" />
					) : (
						<Terminal className="size-4 text-[color:var(--dashboardy-heading)]" />
					)}
				</div>
				<div className="grid min-w-0 flex-1 gap-0.5">
					<p
						className={cn(
							"font-mono text-sm font-semibold",
							isError
								? "text-[color:var(--dashboardy-danger-foreground)]"
								: "text-[color:var(--dashboardy-heading)]",
						)}
					>
						{toolName}
					</p>
					<p className="truncate text-sm text-[color:var(--dashboardy-muted)]">
						{formatInput()}
					</p>
				</div>
			</button>

			{isExpanded && (
				<div className="space-y-3 border-t border-[color:var(--dashboardy-divider)] px-4 py-4">
					{/* Tool Input */}
					<div>
						<h4 className="mb-2 text-sm font-semibold text-[color:var(--dashboardy-heading)]">
							Input Parameters
						</h4>
						<CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
					</div>

					{/* Tool Result */}
					{hasResult && (
						<div>
							<h4
								className={cn(
									"mb-2 text-sm font-semibold",
									isError
										? "text-[color:var(--dashboardy-danger-foreground)]"
										: "text-[color:var(--dashboardy-heading)]",
								)}
							>
								{isError ? "Error Output" : "Output"}
							</h4>
							<CodeBlock
								code={getResultContent()}
								language="text"
								className={
									isError
										? "border-[color:var(--dashboardy-border)]"
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
