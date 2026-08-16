import { describe, expect, it } from "vitest";
import { resolveSessionDetailFastPath } from "./session-detail-fast-path";

describe("session detail fast-path rollout guard", () => {
	it("stays disabled unless the deployment explicitly enables it", () => {
		expect(resolveSessionDetailFastPath(undefined)).toBe(false);
		expect(resolveSessionDetailFastPath("false")).toBe(false);
		expect(resolveSessionDetailFastPath("0")).toBe(false);
		expect(resolveSessionDetailFastPath("true")).toBe(true);
		expect(resolveSessionDetailFastPath(" 1 ")).toBe(true);
	});
});
