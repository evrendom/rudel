import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";

const SyntaxHighlightedCodeBlock = lazy(async () => {
	const module = await import("./SyntaxHighlightedCodeBlock");
	return { default: module.SyntaxHighlightedCodeBlock };
});

interface CodeBlockProps {
	code: string;
	language?: string;
	className?: string;
}

const SUPPORTED_LANGUAGES = new Set([
	"bash",
	"diff",
	"javascript",
	"json",
	"markdown",
	"python",
	"sql",
	"text",
	"tsx",
	"typescript",
	"yaml",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	md: "markdown",
	py: "python",
	sh: "bash",
	shell: "bash",
	ts: "typescript",
	yml: "yaml",
	zsh: "bash",
};

function normalizeLanguage(language?: string) {
	if (!language) {
		return "text";
	}

	const normalizedLanguage = language.trim().toLowerCase();
	const supportedLanguage =
		LANGUAGE_ALIASES[normalizedLanguage] ?? normalizedLanguage;

	if (!SUPPORTED_LANGUAGES.has(supportedLanguage)) {
		return "text";
	}

	return supportedLanguage;
}

export function CodeBlock({
	code,
	language = "text",
	className,
}: CodeBlockProps) {
	const trimmedCode = code.trim();
	const normalizedLanguage = normalizeLanguage(language);
	const shouldHighlight = normalizedLanguage !== "text";

	return (
		<div className={cn("relative rounded-lg overflow-hidden", className)}>
			{shouldHighlight ? (
				<div className="absolute top-0 right-0 px-3 py-1 text-xs font-mono text-gray-400 bg-gray-800 rounded-bl z-10">
					{normalizedLanguage.toUpperCase()}
				</div>
			) : null}
			<div className="overflow-x-auto max-w-full">
				{!shouldHighlight ? (
					<pre className="m-0 rounded-lg p-6 text-sm leading-6 text-foreground">
						<code>{trimmedCode}</code>
					</pre>
				) : (
					<Suspense
						fallback={
							<pre className="m-0 rounded-lg p-6 text-sm leading-6 text-foreground">
								<code>{trimmedCode}</code>
							</pre>
						}
					>
						<SyntaxHighlightedCodeBlock
							code={trimmedCode}
							language={normalizedLanguage}
						/>
					</Suspense>
				)}
			</div>
		</div>
	);
}
