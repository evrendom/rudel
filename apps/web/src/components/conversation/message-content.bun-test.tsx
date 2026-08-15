import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageContent } from "./MessageContent";

describe("MessageContent code formatting", () => {
	test("renders inline backtick code with the shared inline treatment", () => {
		const markup = renderToStaticMarkup(
			<MessageContent content={"Inspect `session.id` before continuing."} />,
		);

		expect(markup).toContain("Inspect ");
		expect(markup).toContain("data-trace-inline-code");
		expect(markup).toContain("session.id");
	});

	test("renders fenced code with the shared Interfere code card", () => {
		const markup = renderToStaticMarkup(
			<MessageContent content={"```ts\nconst active = true;\n```"} />,
		);

		expect(markup).toContain("data-trace-code-block");
		expect(markup).toContain("snippet.ts");
		expect(markup).toContain("const");
	});

	test("renders double-asterisk model prose as strong text", () => {
		const markup = renderToStaticMarkup(
			<MessageContent
				content={"This is **important** while `**literal**` remains code."}
			/>,
		);

		expect(markup).toContain(
			'<strong class="font-semibold">important</strong>',
		);
		expect(markup).not.toContain("**important**");
		expect(markup).toContain("data-trace-inline-code");
		expect(markup).toContain("**literal**");
	});
});
