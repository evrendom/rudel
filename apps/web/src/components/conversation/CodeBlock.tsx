import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
	code: string;
	language?: string;
	highlight?: boolean;
	className?: string;
}

export function CodeBlock({
	code,
	language = "text",
	highlight = true,
	className,
}: CodeBlockProps) {
	const syntaxLanguage = highlight ? language : "text";

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[#0f172a]",
				className,
			)}
		>
			{language && language !== "text" && (
				<div className="absolute top-0 right-0 z-10 rounded-bl-[0.9rem] border-l border-b border-white/10 bg-white/5 px-3 py-1">
					<p className="font-mono text-[0.75rem] text-white/70">
						{language.toUpperCase()}
					</p>
				</div>
			)}
			<div className="overflow-x-auto max-w-full">
				<SyntaxHighlighter
					language={syntaxLanguage}
					style={vscDarkPlus}
					customStyle={{
						margin: 0,
						padding: "1.125rem",
						fontSize: "0.8125rem",
						lineHeight: "1.6",
						borderRadius: 0,
						background: "transparent",
						backgroundColor: "transparent",
					}}
					showLineNumbers={syntaxLanguage !== "text"}
					wrapLines={false}
					wrapLongLines={false}
				>
					{code.trim()}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}
