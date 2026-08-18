import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MessageContent } from "./MessageContent";

describe("MessageContent language signals", () => {
	test("highlights prose without marking fenced code or XML", () => {
		const markup = renderToStaticMarkup(
			<MessageContent
				content={"Great work.\n```text\nfuck\n```\n<context>sorry</context>"}
			/>,
		);

		expect(markup).toContain('data-signal="positive"');
		expect(markup).not.toContain('data-signal="swear"');
		expect(markup).not.toContain('data-signal="apology"');
	});

	test("highlights thinking prose", () => {
		const markup = renderToStaticMarkup(
			<MessageContent
				content={[{ type: "thinking", thinking: "I'm sorry. Good call." }]}
			/>,
		);

		expect(markup).toContain('data-signal="apology"');
		expect(markup).toContain('data-signal="positive"');
	});
});
