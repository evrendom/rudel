import { describe, expect, test } from "bun:test";
import { getTraceCallDisplayConfig } from "@/components/conversation/conversation-trace-call-display";
import { resolveSessionDetailLevel } from "./session-detail-level";

describe("session detail level", () => {
	test("defaults missing and unknown values to the normal level", () => {
		expect(resolveSessionDetailLevel(null)).toBe("normal");
		expect(resolveSessionDetailLevel("unknown")).toBe("normal");
		expect(resolveSessionDetailLevel("normal")).toBe("normal");
		expect(resolveSessionDetailLevel("request")).toBe("request");
	});

	test("uses the headerless flat trace at normal level", () => {
		expect(getTraceCallDisplayConfig("normal")).toMatchObject({
			flatRequestRows: true,
			header: "none",
		});
	});
});
