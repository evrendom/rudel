import { describe, expect, test } from "bun:test";
import { conversationTraceStickyOnlyFillClassName } from "./conversation-trace-class-names";

describe("conversation trace sticky background reset", () => {
	test("preserves semantic text decoration backgrounds", () => {
		expect(conversationTraceStickyOnlyFillClassName).toContain(
			":not([data-signal])",
		);
		expect(conversationTraceStickyOnlyFillClassName).toContain(
			":not([data-search-highlight])",
		);
	});
});
