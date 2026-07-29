import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
	MAX_HIGHLIGHTED_MESSAGE_CODE_UNITS,
	MAX_RENDERED_MESSAGE_CODE_UNITS,
	MessageContent,
} from "../src/components/conversation/MessageContent";
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
const adversarialMessage = createAdversarialMessage(scenario);
const root = createRoot(messageRoot);
const renderStartedAt = performance.now();

flushSync(() => {
	root.render(<MessageContent content={adversarialMessage} />);
});

requestAnimationFrame(() => {
	renderResult.dataset.complete = "true";
	renderResult.dataset.durationMs = String(performance.now() - renderStartedAt);
	renderResult.dataset.domNodes = String(
		messageRoot.querySelectorAll("*").length,
	);
	renderResult.dataset.codeBlocks = String(
		messageRoot.querySelectorAll("pre").length,
	);
	renderResult.dataset.xmlBlocks = String(
		messageRoot.querySelectorAll("button").length,
	);
	renderResult.textContent = "Rendered";
});

function createAdversarialMessage(scenario: string | null) {
	if (scenario === "large-code") {
		const codeLine = "const value = 1;\n";
		const highlightedCode = codeLine.repeat(
			Math.floor(MAX_HIGHLIGHTED_MESSAGE_CODE_UNITS / codeLine.length),
		);
		const highlightedBlock = `\`\`\`js\n${highlightedCode}\`\`\``;
		const secondFenceLength = "```js\n\n```".length;
		const remainingCode = codeLine.repeat(
			Math.floor(
				(MAX_RENDERED_MESSAGE_CODE_UNITS -
					highlightedBlock.length -
					secondFenceLength) /
					codeLine.length,
			),
		);
		return `${highlightedBlock}\`\`\`js\n${remainingCode}\`\`\``;
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
