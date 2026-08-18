import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SignalText } from "./signal-text";

describe("SignalText", () => {
	test("wraps each category and preserves surrounding text", () => {
		const markup = renderToStaticMarkup(
			<SignalText text="Well done, sorry this is shit." />,
		);

		expect(markup).toContain('data-signal="positive"');
		expect(markup).toContain('data-signal="apology"');
		expect(markup).toContain('data-signal="swear"');
		expect(markup).toContain("Well done");
		expect(markup).toContain("sorry");
		expect(markup).toContain("shit");
	});

	test("renders unmatched text without an extra wrapper", () => {
		expect(renderToStaticMarkup(<SignalText text="neutral text" />)).toBe(
			"neutral text",
		);
	});

	test("scopes explicit light and dark signal variables to the leaf", () => {
		const markup = renderToStaticMarkup(<SignalText text="great" />);

		expect(markup).toContain("--language-signal-swear-background");
		expect(markup).toContain("--language-signal-apology-background");
		expect(markup).toContain("--language-signal-positive-background");
		expect(markup).toContain("dark:");
	});
});
