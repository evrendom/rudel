import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
	MAX_RENDERED_MESSAGE_BLOCKS,
	MessageContent,
} from "../src/components/conversation/MessageContent";
import {
	MAX_FORMATTED_MESSAGE_PARTS,
	MAX_HIGHLIGHTED_CODE_BLOCK_UNITS,
	MAX_HIGHLIGHTED_CODE_BLOCKS,
	MAX_RENDERED_MESSAGE_CODE_UNITS,
} from "../src/components/conversation/message-content-parser";
import "../src/index.css";

const messageRoot = document.querySelector("#message-root");
const renderResult = document.querySelector("#render-result");

if (!(messageRoot instanceof HTMLElement)) {
	throw new Error("Message root is missing");
}

if (!(renderResult instanceof HTMLOutputElement)) {
	throw new Error("Render result is missing");
}

const scenario = new URLSearchParams(window.location.search).get("scenario");
const adversarialContent =
	scenario === "array"
		? createAdversarialArrayContent()
		: scenario === "blocks"
			? createExcessMessageBlocks()
			: createAdversarialMessage(scenario);
const root = createRoot(messageRoot);
const renderStartedAt = performance.now();

flushSync(() => {
	root.render(<MessageContent content={adversarialContent} />);
});

requestAnimationFrame(() => {
	renderResult.dataset.complete = "true";
	renderResult.dataset.durationMs = String(performance.now() - renderStartedAt);
	renderResult.dataset.domNodes = String(
		messageRoot.querySelectorAll("*").length,
	);
	renderResult.dataset.codeBlocks = String(
		messageRoot.querySelectorAll('[data-testid="message-code-block"]').length,
	);
	renderResult.dataset.highlightedCodeBlocks = String(
		messageRoot.querySelectorAll(
			'[data-testid="message-code-block"][data-highlighted="true"]',
		).length,
	);
	renderResult.dataset.xmlBlocks = String(
		messageRoot.querySelectorAll('[data-testid="message-xml-block"]').length,
	);
	renderResult.dataset.textBlocks = String(
		messageRoot.querySelectorAll('[data-testid="message-text-block"]').length,
	);
	renderResult.dataset.maxMessageBlocks = String(MAX_RENDERED_MESSAGE_BLOCKS);
	renderResult.textContent = "Rendered";
});

function createAdversarialArrayContent() {
	const blockCount = MAX_FORMATTED_MESSAGE_PARTS + 2;
	const codeLine = "const value = 1;\n";
	const fenceLength = "```js\n\n```".length;
	const codeUnitsPerBlock =
		Math.floor(MAX_RENDERED_MESSAGE_CODE_UNITS / blockCount) - fenceLength;
	const code = codeLine.repeat(Math.floor(codeUnitsPerBlock / codeLine.length));

	return Array.from({ length: blockCount }, (_, blockIndex) => ({
		type: "text" as const,
		text:
			blockIndex === blockCount - 1
				? '```js\nconst marker = "array-tail-visible";\n```'
				: `\`\`\`js\n${code}\`\`\``,
	}));
}

function createExcessMessageBlocks() {
	return Array.from(
		{ length: MAX_RENDERED_MESSAGE_BLOCKS + 1 },
		(_, blockIndex) => ({
			type: "text" as const,
			text: `Plain text block ${blockIndex}`,
		}),
	);
}

function createAdversarialMessage(scenario: string | null) {
	if (scenario === "duplicate-xml") {
		return "<metadata><field>first</field><field>second</field></metadata>";
	}

	if (scenario === "large-code") {
		const codeLine = "const value = 1;\n";
		const highlightedCode = codeLine.repeat(
			Math.floor(MAX_HIGHLIGHTED_CODE_BLOCK_UNITS / codeLine.length),
		);
		const highlightedBlock = `\`\`\`js\n${highlightedCode}\`\`\``;
		const highlightedBlocks = highlightedBlock.repeat(
			MAX_HIGHLIGHTED_CODE_BLOCKS,
		);
		const finalFenceLength = "```js\n\n```".length;
		const remainingCode = codeLine.repeat(
			Math.floor(
				(MAX_RENDERED_MESSAGE_CODE_UNITS -
					highlightedBlocks.length -
					finalFenceLength) /
					codeLine.length,
			),
		);
		return `${highlightedBlocks}\`\`\`js\n${remainingCode}\`\`\``;
	}

	const repeatedBlock =
		scenario === "xml"
			? "<metadata><field>value</field></metadata>"
			: "```js\nconst value = 1;\n```";
	const repetitions = Math.floor(
		MAX_RENDERED_MESSAGE_CODE_UNITS / repeatedBlock.length,
	);
	return repeatedBlock.repeat(repetitions);
}
