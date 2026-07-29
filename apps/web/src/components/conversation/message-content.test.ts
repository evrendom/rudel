import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import {
	MAX_RENDERED_MESSAGE_CODE_UNITS,
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
