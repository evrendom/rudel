import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
	code: string;
	language?: string;
	className?: string;
}

export function CodeBlock({
	code,
	language = "text",
	className,
}: CodeBlockProps) {
	return (
		<div className={cn("relative rounded-lg overflow-hidden", className)}>
			{language && language !== "text" && (
				<div className="absolute top-0 right-0 px-3 py-1 text-xs font-mono text-gray-400 bg-gray-800 rounded-bl z-10">
					{language.toUpperCase()}
				</div>
			)}
			<div className="overflow-x-auto max-w-full">
				<SyntaxHighlighter
					language={language}
					style={vscDarkPlus}
					customStyle={{
						margin: 0,
						padding: "1.5rem",
						fontSize: "0.875rem",
						lineHeight: "1.5",
						borderRadius: "0.5rem",
					}}
					showLineNumbers={language !== "text"}
					wrapLines={false}
					wrapLongLines={false}
				>
					{code.trim()}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}
