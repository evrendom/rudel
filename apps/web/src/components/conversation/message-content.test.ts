import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import {
	MAX_HIGHLIGHTED_MESSAGE_CODE_UNITS,
	MAX_RENDERED_MESSAGE_CODE_UNITS,
	MAX_RENDERED_MESSAGE_PARTS,
	parseMessageText,
} from "./MessageContent";

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
		const [part] = parseMessageText(oversizedText);

		assert(part?.type === "text");
		expect(part.content).toContain("1000 code units omitted");
		expect(part.content.length).toBeLessThan(
			MAX_RENDERED_MESSAGE_CODE_UNITS + 100,
		);
	});

	it("shows excess code blocks as one plain-text remainder", () => {
		const codeBlock = "```js\nconst value = 1;\n```";
		const input = codeBlock.repeat(MAX_RENDERED_MESSAGE_PARTS * 2);
		const parts = parseMessageText(input);
		const lastPart = parts.at(-1);

		assert(lastPart?.type === "text");
		expect(parts).toHaveLength(MAX_RENDERED_MESSAGE_PARTS);
		expect(parts.filter((part) => part.type === "code")).toHaveLength(
			MAX_RENDERED_MESSAGE_PARTS - 1,
		);
		expect(lastPart.content).toContain("shown as plain text");
		expect(lastPart.content).toContain(codeBlock);
	});

	it("counts nested XML fields against the rendered-part budget", () => {
		const innerContent = "<field>value</field>".repeat(
			MAX_RENDERED_MESSAGE_PARTS,
		);
		const input = `<metadata>${innerContent}</metadata>`;
		const [part] = parseMessageText(input);

		assert(part?.type === "text");
		expect(part.content).toContain("shown as plain text");
		expect(part.content).toContain(input);
	});

	it("bounds syntax highlighting across code blocks", () => {
		const code = "x".repeat(MAX_HIGHLIGHTED_MESSAGE_CODE_UNITS);
		const codeBlock = `\`\`\`js\n${code}\`\`\``;
		const parts = parseMessageText(codeBlock.repeat(2));
		const [firstPart, secondPart] = parts;

		assert(firstPart?.type === "code");
		assert(secondPart?.type === "code");
		expect(firstPart.highlight).toBe(true);
		expect(secondPart.highlight).toBe(false);
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
