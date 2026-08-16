import { describe, expect, it } from "vitest";
import { resolveSessionDetailFastPath } from "./session-detail-fast-path";

describe("session detail fast-path rollout guard", () => {
	it("defaults on and preserves an explicit legacy-path opt-out", () => {
		expect(resolveSessionDetailFastPath(undefined)).toBe(true);
		expect(resolveSessionDetailFastPath("")).toBe(true);
		expect(resolveSessionDetailFastPath("false")).toBe(false);
		expect(resolveSessionDetailFastPath("0")).toBe(false);
		expect(resolveSessionDetailFastPath("true")).toBe(true);
		expect(resolveSessionDetailFastPath(" 1 ")).toBe(true);
		expect(resolveSessionDetailFastPath("unexpected")).toBe(true);
	});
});
