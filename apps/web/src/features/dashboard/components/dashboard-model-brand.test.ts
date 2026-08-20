import { describe, expect, it } from "vitest";
import { formatModelDisplayLabel } from "./dashboard-model-brand";

describe("formatModelDisplayLabel", () => {
	it("uses the concise Fable family name", () => {
		expect(formatModelDisplayLabel("claude-fable-5")).toBe("Fable 5");
		expect(formatModelDisplayLabel("claude-fable-5-20260609")).toBe("Fable 5");
		expect(formatModelDisplayLabel("Claude Fable 5")).toBe("Fable 5");
	});
});
