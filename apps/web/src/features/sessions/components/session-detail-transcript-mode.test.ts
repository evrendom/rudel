import { describe, expect, it } from "vitest";
import { shouldUseVirtualSessionTranscript } from "./session-detail-transcript-mode";

describe("session detail transcript rollout", () => {
	it("keeps the virtual transcript opt-in until the rollout gates pass", () => {
		expect(shouldUseVirtualSessionTranscript(null)).toBe(false);
		expect(shouldUseVirtualSessionTranscript("virtual")).toBe(true);
		expect(shouldUseVirtualSessionTranscript("legacy")).toBe(false);
	});
});
