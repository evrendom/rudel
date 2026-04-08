import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface SyntaxHighlightedCodeBlockProps {
	code: string;
	language: string;
}

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("diff", diff);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

export function SyntaxHighlightedCodeBlock({
	code,
	language,
}: SyntaxHighlightedCodeBlockProps) {
	return (
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
			showLineNumbers
			wrapLines={false}
			wrapLongLines={false}
		>
			{code.trim()}
		</SyntaxHighlighter>
	);
}
