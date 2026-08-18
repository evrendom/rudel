import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageContent } from "./MessageContent";

describe("MessageContent language signals", () => {
	test("highlights plain and strong prose without marking code or XML", () => {
		const markup = renderToStaticMarkup(
			<MessageContent
				content={
					"**Awesome.** `fuck`\n```text\nshit\n```\n<context>sorry</context>"
				}
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
