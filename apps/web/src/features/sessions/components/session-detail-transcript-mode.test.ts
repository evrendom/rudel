import { describe, expect, it, vi } from "vitest";
import { shouldUseVirtualSessionTranscript } from "./session-detail-transcript-mode";

describe("session detail transcript rollout", () => {
	it("uses the virtual transcript by default", () => {
		expect(shouldUseVirtualSessionTranscript(null)).toBe(true);
		expect(shouldUseVirtualSessionTranscript("virtual")).toBe(true);
	});

	it("warns when the retired legacy query value is used", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(shouldUseVirtualSessionTranscript("legacy")).toBe(true);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
		warn.mockRestore();
	});
});
