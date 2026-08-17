import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { usePreparedCodeHighlight } from "./code-highlight-cache";
import type { PreparedCodeToken } from "./code-highlight-types";
import {
	TraceCodeIcon,
	TraceMarkdownIcon,
	TraceTypeScriptIcon,
} from "./conversation-trace-hugeicons";
import "./code-block.css";

// A scroll region has no interactive native element equivalent, but must be
// keyboard-focusable so code scrolling is an explicit user choice.
const focusableCodeScrollRegionProps = { tabIndex: 0 } as const;

export type CodeLineKind = "addition" | "deletion" | "neutral";

interface CodeBlockProps {
	changeSummary?: {
		additions: number;
		deletions: number;
	};
	code: string;
	className?: string;
	filename?: string;
	language?: string;
	lineChangeKind?: Exclude<CodeLineKind, "neutral">;
	lineChangeKinds?: readonly CodeLineKind[];
	showLineNumbers?: boolean;
}

interface InlineCodeProps {
	children: string;
}

function getDefaultCodeFilename(language: string) {
	switch (language.toLowerCase()) {
		case "typescript":
		case "ts":
			return "snippet.ts";
		case "tsx":
			return "snippet.tsx";
		case "javascript":
		case "js":
			return "snippet.js";
		case "jsx":
			return "snippet.jsx";
		case "json":
			return "data.json";
		case "bash":
		case "shell":
		case "sh":
		case "zsh":
			return "script.sh";
		case "python":
		case "py":
			return "snippet.py";
		case "css":
			return "styles.css";
		case "html":
			return "index.html";
		case "sql":
			return "query.sql";
		case "yaml":
		case "yml":
			return "config.yaml";
		case "markdown":
		case "md":
			return "README.md";
		case "text":
			return "output.txt";
		default:
			return `snippet.${language.toLowerCase()}`;
	}
}

function getCodeLineKind(
	line: string,
	language: string,
	lineChangeKind: Exclude<CodeLineKind, "neutral"> | undefined,
): CodeLineKind {
	if (lineChangeKind) {
		return lineChangeKind;
	}

	const normalizedLanguage = language.toLowerCase();
	if (normalizedLanguage !== "diff" && normalizedLanguage !== "patch") {
		return "neutral";
	}

	const trimmedLine = line.trimStart();
	if (trimmedLine.startsWith("+") && !trimmedLine.startsWith("+++")) {
		return "addition";
	}
	if (trimmedLine.startsWith("-") && !trimmedLine.startsWith("---")) {
		return "deletion";
	}
	return "neutral";
}

function getCodeHeaderIcon(filename: string, language: string) {
	if (/\.(?:cts|mts|ts|tsx)$/i.test(filename)) {
		return {
			className: "text-[#3178c6]",
			context: "typescript",
			Icon: TraceTypeScriptIcon,
		};
	}
	if (/\.(?:markdown|md)$/i.test(filename)) {
		return {
			className: "text-[color:var(--trace-code-tertiary,rgba(0,0,0,0.447))]",
			context: "markdown",
			Icon: TraceMarkdownIcon,
		};
	}

	const isNamedFile = !/^(?:error output|input|output)$/i.test(filename);
	if (isNamedFile && language.toLowerCase() !== "text") {
		return {
			className: "text-[color:var(--trace-code-tertiary,rgba(0,0,0,0.447))]",
			context: "code",
			Icon: TraceCodeIcon,
		};
	}

	return undefined;
}

export function CodeBlock({
	changeSummary,
	code,
	className,
	filename,
	language = "text",
	lineChangeKind,
	lineChangeKinds,
	showLineNumbers,
}: CodeBlockProps) {
	const { resolvedTheme } = useTheme();
	const normalizedCode = code.trim();
	const codeLines = normalizedCode.split("\n");
	const fileLabel = filename ?? getDefaultCodeFilename(language);
	const shouldShowLineNumbers = showLineNumbers ?? language !== "text";
	const lineNumberWidth = Math.max(16, String(codeLines.length).length * 8);
	const lineGutterWidth = lineNumberWidth + 22;
	const headerIcon = getCodeHeaderIcon(fileLabel, language);
	const preparedHighlight = usePreparedCodeHighlight({
		code: normalizedCode,
		language,
		theme: resolvedTheme === "dark" ? "dark" : "light",
	});
	const getLineProps = (lineNumber: number) => {
		const kind =
			lineChangeKinds?.[lineNumber - 1] ??
			getCodeLineKind(
				codeLines[lineNumber - 1] ?? "",
				language,
				lineChangeKind,
			);
		const style: CSSProperties = {
			display: "block",
			overflowWrap: "anywhere",
			paddingLeft: shouldShowLineNumbers ? `${lineGutterWidth}px` : "6px",
			textIndent: shouldShowLineNumbers ? `-${lineGutterWidth}px` : "-6px",
			whiteSpace: "pre-wrap",
		};

		return {
			className: cn(
				"relative min-h-4 min-w-full rounded-[3px] before:mx-0.5 before:inline-block before:h-3 before:w-0.5 before:rounded-full before:align-middle before:content-['']",
				kind === "neutral" && "before:bg-transparent",
				kind === "deletion" &&
					"bg-[linear-gradient(to_right,var(--trace-code-deletion-surface),transparent)] before:bg-[var(--trace-code-deletion-marker)]",
				kind === "addition" &&
					"bg-[linear-gradient(to_right,var(--trace-code-addition-surface),transparent)] before:bg-[var(--trace-code-addition-marker)]",
			),
			"data-trace-code-line": true,
			"data-trace-code-line-kind": kind,
			style,
		};
	};

	const highlightedLines = preparedHighlight?.lines;
	const codeContent = (
		<pre
			data-trace-code-highlight-state={
				highlightedLines ? "highlighted" : "plain"
			}
			style={{
				background: "transparent",
				backgroundColor: "transparent",
				borderRadius: 0,
				color: "var(--trace-code-primary)",
				fontFamily:
					'"Geist Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
				fontSize: "12px",
				lineHeight: "16px",
				margin: 0,
				overflow: "hidden",
				overflowWrap: "anywhere",
				padding: "6px 8px",
				whiteSpace: "pre-wrap",
			}}
		>
			<code>
				{codeLines.map((line, index) => {
					const lineNumber = index + 1;
					const tokens = highlightedLines?.[index];
					return (
						<span key={lineNumber} {...getLineProps(lineNumber)}>
							{shouldShowLineNumbers ? (
								<span
									aria-hidden="true"
									style={{
										color: "var(--trace-code-line-number)",
										display: "inline-block",
										fontStyle: "normal",
										marginRight: "16px",
										minWidth: `${lineNumberWidth}px`,
										paddingRight: 0,
										textAlign: "right",
										width: `${lineNumberWidth}px`,
									}}
								>
									{lineNumber}
								</span>
							) : null}
							{tokens
								? tokens.map((token) => (
										<HighlightedCodeToken
											key={`${lineNumber}:${token.offset}`}
											token={token}
										/>
									))
								: line}
							{index < codeLines.length - 1 ? "\n" : null}
						</span>
					);
				})}
			</code>
		</pre>
	);

	const card = (
		<div
			className={cn("trace-code-block relative rounded-lg", className)}
			data-trace-code-block
			data-trace-code-line-numbers={shouldShowLineNumbers}
		>
			<div
				className="relative z-20 flex h-8 items-center gap-1.5 rounded-t-lg border-b-[0.5px] border-[color:var(--trace-code-border)] px-2.5"
				data-trace-code-block-header
			>
				{headerIcon ? (
					<span
						aria-hidden="true"
						className={cn("shrink-0", headerIcon.className)}
						data-trace-code-header-icon={headerIcon.context}
					>
						<headerIcon.Icon className="size-3.5" />
					</span>
				) : null}
				<p
					className="min-w-0 truncate font-sans text-[0.8125rem] leading-5 font-normal text-[color:var(--trace-code-secondary)]"
					data-trace-code-file-label
				>
					{fileLabel}
				</p>
				{changeSummary ? (
					<span
						className="ml-auto flex shrink-0 items-center gap-1.5 dashboardy-mono text-[0.6875rem]/4 font-medium tabular-nums"
						data-trace-code-additions={changeSummary.additions}
						data-trace-code-change-summary
						data-trace-code-deletions={changeSummary.deletions}
						title={`${changeSummary.additions} lines added, ${changeSummary.deletions} lines deleted`}
					>
						<span className="text-[color:var(--trace-code-addition-marker)]">
							+{changeSummary.additions}
						</span>
						<span className="text-[color:var(--trace-code-deletion-marker)]">
							−{changeSummary.deletions}
						</span>
					</span>
				) : null}
			</div>
			<section
				{...focusableCodeScrollRegionProps}
				aria-label={`Scrollable code for ${fileLabel}`}
				className="max-w-full overflow-hidden"
				data-trace-code-block-content
				onPointerDown={(event) => {
					event.currentTarget.focus({ preventScroll: true });
				}}
			>
				{codeContent}
			</section>
		</div>
	);

	return card;
}

function HighlightedCodeToken({ token }: { token: PreparedCodeToken }) {
	const fontStyle = token.fontStyle ?? 0;
	return (
		<span
			style={{
				color: token.color,
				fontStyle: fontStyle & 1 ? "italic" : undefined,
				fontWeight: fontStyle & 2 ? 700 : undefined,
				textDecoration:
					[
						fontStyle & 4 ? "underline" : undefined,
						fontStyle & 8 ? "line-through" : undefined,
					]
						.filter((decoration) => decoration !== undefined)
						.join(" ") || undefined,
			}}
		>
			{token.content}
		</span>
	);
}

export function InlineCode({ children }: InlineCodeProps) {
	return (
		<code
			className="trace-inline-code rounded-[4px] px-1 py-0.5 [box-decoration-break:clone] [overflow-wrap:anywhere]"
			data-trace-inline-code
		>
			{children}
		</code>
	);
}
