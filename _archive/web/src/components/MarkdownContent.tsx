import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
	content: string;
	className?: string;
}

export function MarkdownContent({
	content,
	className = "",
}: MarkdownContentProps) {
	return (
		<div
			className={`prose prose-neutral dark:prose-invert max-w-none prose-sm ${className}`}
		>
			<Markdown
				remarkPlugins={[remarkGfm]}
				components={{
					code({ className: codeClassName, children, ...props }) {
						const match = /language-(\w+)/.exec(codeClassName || "");
						const isInline = !match;

						if (isInline) {
							return (
								<code
									className="bg-muted/70 px-1.5 py-0.5 rounded text-sm"
									{...props}
								>
									{children}
								</code>
							);
						}

						return (
							<div className="relative my-4">
								<div className="flex items-center justify-between bg-muted/30 px-3 py-1.5 border-b text-xs">
									<span className="font-medium uppercase">{match[1]}</span>
								</div>
								<SyntaxHighlighter
									style={vscDarkPlus}
									language={match[1]}
									PreTag="div"
									customStyle={{
										marginTop: 0,
										borderTopLeftRadius: 0,
										borderTopRightRadius: 0,
									}}
								>
									{String(children).replace(/\n$/, "")}
								</SyntaxHighlighter>
							</div>
						);
					},
				}}
			>
				{content}
			</Markdown>
		</div>
	);
}
