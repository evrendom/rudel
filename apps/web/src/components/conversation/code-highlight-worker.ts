import { createHighlighterCore } from "shiki/core";
import bash from "shiki/dist/langs/bash.mjs";
import css from "shiki/dist/langs/css.mjs";
import diff from "shiki/dist/langs/diff.mjs";
import html from "shiki/dist/langs/html.mjs";
import javascript from "shiki/dist/langs/javascript.mjs";
import json from "shiki/dist/langs/json.mjs";
import jsx from "shiki/dist/langs/jsx.mjs";
import markdown from "shiki/dist/langs/markdown.mjs";
import python from "shiki/dist/langs/python.mjs";
import sql from "shiki/dist/langs/sql.mjs";
import tsx from "shiki/dist/langs/tsx.mjs";
import typescript from "shiki/dist/langs/typescript.mjs";
import yaml from "shiki/dist/langs/yaml.mjs";
import darkPlus from "shiki/dist/themes/dark-plus.mjs";
import lightPlus from "shiki/dist/themes/light-plus.mjs";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type {
	CodeHighlightRequest,
	CodeHighlightResponse,
} from "./code-highlight-types";

const highlighterPromise = createHighlighterCore({
	engine: createJavaScriptRegexEngine(),
	langs: [
		bash,
		css,
		diff,
		html,
		javascript,
		json,
		jsx,
		markdown,
		python,
		sql,
		tsx,
		typescript,
		yaml,
	],
	themes: [darkPlus, lightPlus],
});

function normalizeCodeLanguage(language: string) {
	switch (language.toLowerCase()) {
		case "bash":
		case "shell":
		case "shellscript":
		case "sh":
		case "zsh":
			return "shellscript";
		case "css":
			return "css";
		case "diff":
		case "patch":
			return "diff";
		case "htm":
		case "html":
		case "xml":
			return "html";
		case "javascript":
		case "js":
			return "javascript";
		case "jsx":
			return "jsx";
		case "json":
		case "jsonc":
			return "json";
		case "markdown":
		case "md":
			return "markdown";
		case "python":
		case "py":
			return "python";
		case "sql":
			return "sql";
		case "tsx":
			return "tsx";
		case "typescript":
		case "ts":
			return "typescript";
		case "yaml":
		case "yml":
			return "yaml";
		default:
			return undefined;
	}
}

globalThis.addEventListener(
	"message",
	async (event: MessageEvent<CodeHighlightRequest>) => {
		const startedAt = performance.now();
		const language = normalizeCodeLanguage(event.data.language);
		const lines = language
			? (await highlighterPromise).codeToTokens(event.data.code, {
					lang: language,
					theme: event.data.theme === "dark" ? "dark-plus" : "light-plus",
					tokenizeMaxLineLength: 4_000,
					tokenizeTimeLimit: 32,
				}).tokens
			: event.data.code.split("\n").map((line) => [
					{
						color: undefined,
						content: line,
						fontStyle: undefined,
						offset: 0,
					},
				]);
		const response: CodeHighlightResponse = {
			charCount: event.data.code.length,
			durationMs: performance.now() - startedAt,
			key: event.data.key,
			language: event.data.language,
			lines: lines.map((line) =>
				line.map((token) => ({
					color: token.color,
					content: token.content,
					fontStyle: token.fontStyle,
					offset: token.offset,
				})),
			),
		};
		globalThis.postMessage(response);
	},
);
