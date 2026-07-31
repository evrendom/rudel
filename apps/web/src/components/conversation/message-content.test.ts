import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import {
	MAX_FORMATTED_MESSAGE_PARTS,
	MAX_HIGHLIGHTED_CODE_BLOCK_UNITS,
	MAX_HIGHLIGHTED_CODE_BLOCKS,
	MAX_RENDERED_MESSAGE_CODE_UNITS,
	parseMessageText,
	parseMessageTextBlocks,
} from "./message-content-parser";

describe("parseMessageText", () => {
	it("preserves text, code blocks, and supported XML blocks", () => {
		expect(
			parseMessageText(`
Before
\`\`\`ts
const answer = 42;
\`\`\`
<environment_context>
	<cwd>/tmp/project</cwd>
	<shell>zsh</shell>
</environment_context>
After
`),
		).toEqual([
			{ type: "text", content: "Before" },
			{
				type: "code",
				content: "const answer = 42;\n",
				language: "ts",
				highlight: true,
			},
			{
				type: "xml",
				tag: "environment_context",
				entries: [
					{ key: "cwd", value: "/tmp/project" },
					{ key: "shell", value: "zsh" },
				],
			},
			{ type: "text", content: "After" },
		]);
	});

	it("renders malformed top-level markup as plain text", () => {
		const malformedText = "<unclosed>".repeat(10_000);

		expect(parseMessageText(malformedText)).toEqual([
			{ type: "text", content: malformedText },
		]);
	});

	it("uses a bounded fallback for oversized messages", () => {
		const oversizedText = "<".repeat(MAX_RENDERED_MESSAGE_CODE_UNITS + 1_000);
		const [textPart, noticePart] = parseMessageText(oversizedText);

		assert(textPart?.type === "text");
		assert(noticePart?.type === "notice");
		expect(textPart.content).toHaveLength(MAX_RENDERED_MESSAGE_CODE_UNITS);
		expect(noticePart.content).toBe("Truncated — 1000 characters omitted.");
	});

	it("shows excess code blocks as one plain-text remainder", () => {
		const codeBlock = "```js\nconst value = 1;\n```";
		const input = codeBlock.repeat(MAX_FORMATTED_MESSAGE_PARTS * 2);
		const parts = parseMessageText(input);
		const noticePart = parts.find((part) => part.type === "notice");
		const remainingTextPart = parts.at(-1);

		assert(noticePart?.type === "notice");
		assert(remainingTextPart?.type === "text");
		expect(parts.filter((part) => part.type === "code")).toHaveLength(
			MAX_FORMATTED_MESSAGE_PARTS,
		);
		expect(noticePart.content).toBe(
			"Remaining content shown unformatted (message too large).",
		);
		expect(remainingTextPart.content).toContain(codeBlock);
		expect(remainingTextPart.content).not.toContain(noticePart.content);
	});

	it("counts nested XML fields against the rendered-part budget", () => {
		const innerContent = "<field>value</field>".repeat(
			MAX_FORMATTED_MESSAGE_PARTS,
		);
		const input = `<metadata>${innerContent}</metadata>`;
		const [noticePart, textPart] = parseMessageText(input);

		assert(noticePart?.type === "notice");
		assert(textPart?.type === "text");
		expect(textPart.content).toBe(input);
	});

	it("bounds syntax highlighting by block size and block count", () => {
		const code = "x".repeat(MAX_HIGHLIGHTED_CODE_BLOCK_UNITS);
		const codeBlock = `\`\`\`js\n${code}\`\`\``;
		const parts = parseMessageText(
			codeBlock.repeat(MAX_HIGHLIGHTED_CODE_BLOCKS + 1),
		);
		const codeParts = parts.filter((part) => part.type === "code");

		expect(codeParts.filter((part) => part.highlight)).toHaveLength(
			MAX_HIGHLIGHTED_CODE_BLOCKS,
		);
		expect(codeParts.at(-1)?.highlight).toBe(false);
	});

	it("counts an oversized code block toward the predictable highlight window", () => {
		const oversizedCodeBlock = `\`\`\`js\n${"x".repeat(
			MAX_HIGHLIGHTED_CODE_BLOCK_UNITS + 1,
		)}\`\`\``;
		const smallCodeBlock = "```js\nconst value = 1;\n```";
		const parts = parseMessageText(
			oversizedCodeBlock + smallCodeBlock.repeat(MAX_HIGHLIGHTED_CODE_BLOCKS),
		);
		const codeParts = parts.filter((part) => part.type === "code");

		expect(codeParts[0]?.highlight).toBe(false);
		expect(codeParts.filter((part) => part.highlight)).toHaveLength(
			MAX_HIGHLIGHTED_CODE_BLOCKS - 1,
		);
		expect(codeParts.at(-1)?.highlight).toBe(false);
	});

	it("shares formatting limits across text blocks without dropping later text", () => {
		const codeBlock = "```js\nconst value = 1;\n```";
		const tailMarker = "array-tail-visible";
		const textBlocks = Array.from(
			{ length: MAX_FORMATTED_MESSAGE_PARTS + 2 },
			(_, blockIndex) =>
				blockIndex === MAX_FORMATTED_MESSAGE_PARTS + 1
					? `\`\`\`js\nconst marker = "${tailMarker}";\n\`\`\``
					: codeBlock,
		);
		const parsedBlocks = parseMessageTextBlocks(textBlocks);
		const parts = parsedBlocks.flatMap((block) => block ?? []);

		expect(parts.filter((part) => part.type === "code")).toHaveLength(
			MAX_FORMATTED_MESSAGE_PARTS,
		);
		expect(parts.filter((part) => part.type === "notice")).toHaveLength(1);
		expect(
			parsedBlocks
				.at(-1)
				?.some(
					(part) => part.type === "text" && part.content.includes(tailMarker),
				),
		).toBe(true);
	});

	it("does not spend the formatting budget on plain text blocks", () => {
		const textBlocks = [
			...Array.from(
				{ length: MAX_FORMATTED_MESSAGE_PARTS * 2 },
				(_, index) => `Plain text ${index}`,
			),
			"```js\nconst value = 1;\n```",
		];
		const parsedBlocks = parseMessageTextBlocks(textBlocks);
		const lastBlock = parsedBlocks.at(-1);

		expect(lastBlock?.[0]?.type).toBe("code");
	});

	it("scales approximately linearly for unmatched markup prefixes", () => {
		const smallInput = "<unclosed>".repeat(4_000);
		const largeInput = "<unclosed>".repeat(8_000);

		parseMessageText(smallInput);
		parseMessageText(largeInput);

		const smallDuration = measureParseDuration(smallInput);
		const largeDuration = measureParseDuration(largeInput);

		expect(largeDuration).toBeLessThan(Math.max(smallDuration * 3.5, 50));
		expect(largeDuration).toBeLessThan(500);
	});

	it("scales approximately linearly for unmatched nested-tag prefixes", () => {
		const smallInput = `<outer>${"<nested>".repeat(4_000)}</outer>`;
		const largeInput = `<outer>${"<nested>".repeat(8_000)}</outer>`;

		parseMessageText(smallInput);
		parseMessageText(largeInput);

		const smallDuration = measureParseDuration(smallInput);
		const largeDuration = measureParseDuration(largeInput);

		expect(largeDuration).toBeLessThan(Math.max(smallDuration * 3.5, 50));
		expect(largeDuration).toBeLessThan(500);
	});

	it("parses the maximum structured-message budget within 500 ms", () => {
		const prefix = "<unclosed>";
		const repetitions = Math.floor(
			MAX_RENDERED_MESSAGE_CODE_UNITS / prefix.length,
		);
		const input = prefix.repeat(repetitions);
		const start = performance.now();

		parseMessageText(input);

		expect(performance.now() - start).toBeLessThan(500);
	});
});

function measureParseDuration(input: string) {
	const start = performance.now();

	for (let iteration = 0; iteration < 10; iteration += 1) {
		parseMessageText(input);
	}

	return performance.now() - start;
}
