import { describe, expect, it } from "vitest";
import { shouldUseVirtualSessionTranscript } from "./session-detail-transcript-mode";

describe("session detail transcript rollout", () => {
	it("defaults to the virtual transcript and keeps an explicit legacy escape hatch", () => {
		expect(shouldUseVirtualSessionTranscript(null)).toBe(true);
		expect(shouldUseVirtualSessionTranscript("virtual")).toBe(true);
		expect(shouldUseVirtualSessionTranscript("legacy")).toBe(false);
	});
});
