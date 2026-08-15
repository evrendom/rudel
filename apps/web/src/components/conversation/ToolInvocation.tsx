import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";
import { formatShellOutput } from "./conversation-tools";
import {
	TraceAlertIcon,
	TraceChevronDownIcon,
	TraceChevronRightIcon,
	TraceTerminalIcon,
} from "./conversation-trace-hugeicons";

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
	const panelId = useId();

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
	const output = formatShellOutput(getResultContent());

	return (
		<div
			className={cn(
				"overflow-hidden rounded-[1rem] border",
				isError
					? "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-danger-surface)]"
					: "border-[color:var(--dashboardy-divider)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_82%,white)]",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
				aria-controls={panelId}
				className="flex min-w-0 w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dashboardy-border)]"
			>
				{isExpanded ? (
					<TraceChevronDownIcon className="size-4 shrink-0 text-[color:var(--dashboardy-muted)]" />
				) : (
					<TraceChevronRightIcon className="size-4 shrink-0 text-[color:var(--dashboardy-muted)]" />
				)}
				<div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]">
					{isError ? (
						<TraceAlertIcon className="size-4 text-[color:var(--dashboardy-danger-foreground)]" />
					) : (
						<TraceTerminalIcon className="size-4 text-[color:var(--dashboardy-heading)]" />
					)}
				</div>
				<div className="grid min-w-0 flex-1 gap-1">
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
				<div
					id={panelId}
					className="space-y-3.5 border-t border-[color:var(--dashboardy-divider)] px-4 py-4"
				>
					{/* Tool Input */}
					<CodeBlock
						code={JSON.stringify(input, null, 2)}
						filename="Input"
						language="json"
					/>

					{/* Tool Result */}
					{hasResult && (
						<CodeBlock
							code={output.text}
							filename={isError ? "Error Output" : "Output"}
							language={output.language}
							showLineNumbers
						/>
					)}
				</div>
			)}
		</div>
	);
}
