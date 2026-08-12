import { describe, expect, test } from "bun:test";
import {
	formatTraceCallContext,
	getTraceCallDisplayConfig,
	resolveTraceCallVariant,
	shouldCollapseTraceCall,
	TRACE_CALL_DISPLAY_PRESETS,
} from "./conversation-trace-call-display";

describe("formatTraceCallContext", () => {
	test("shows the first call's absolute context", () => {
		expect(formatTraceCallContext(24_000, undefined)).toBe("ctx 24k");
	});

	test("shows a positive context delta for later calls", () => {
		expect(formatTraceCallContext(26_100, 24_000)).toBe("+2.1k ctx");
	});

	test("shows a negative context delta after compaction", () => {
		expect(formatTraceCallContext(19_000, 50_000)).toBe("−31k ctx");
	});
});

describe("trace call collapse", () => {
	test("only collapse presets inline a call with exactly one branch", () => {
		expect(shouldCollapseTraceCall(TRACE_CALL_DISPLAY_PRESETS.v2, 1)).toBe(
			false,
		);
		expect(shouldCollapseTraceCall(TRACE_CALL_DISPLAY_PRESETS.v3, 1)).toBe(
			true,
		);
		expect(shouldCollapseTraceCall(TRACE_CALL_DISPLAY_PRESETS.v3, 2)).toBe(
			false,
		);
		expect(shouldCollapseTraceCall(TRACE_CALL_DISPLAY_PRESETS.v5, 1)).toBe(
			true,
		);
	});
});

describe("trace call preset resolution", () => {
	test("resolves every named preset and falls back to v1", () => {
		expect(resolveTraceCallVariant("v1")).toBe("v1");
		expect(resolveTraceCallVariant("v2")).toBe("v2");
		expect(resolveTraceCallVariant("v3")).toBe("v3");
		expect(resolveTraceCallVariant("v4")).toBe("v4");
		expect(resolveTraceCallVariant("v5")).toBe("v5");
		expect(resolveTraceCallVariant("v6")).toBe("v6");
		expect(resolveTraceCallVariant("v7")).toBe("v7");
		expect(resolveTraceCallVariant("v8")).toBe("v8");
		expect(resolveTraceCallVariant("unknown")).toBe("v1");
		expect(resolveTraceCallVariant(null)).toBe("v1");
	});

	test("maps a resolved variant to the shared configuration table", () => {
		const variant = resolveTraceCallVariant("v5");
		expect(getTraceCallDisplayConfig(variant)).toEqual({
			flatRequestRows: false,
			groupTreatment: "none",
			header: "separator-multi-only",
			inputPill: "delta",
			inlineUsageOnCollapsedRow: true,
			label: "none",
		});
	});

	test("keeps V7 and V8 flat while changing only the grouping treatment", () => {
		expect(getTraceCallDisplayConfig("v7")).toMatchObject({
			flatRequestRows: true,
			groupTreatment: "fill",
			header: "separator",
		});
		expect(getTraceCallDisplayConfig("v8")).toMatchObject({
			flatRequestRows: true,
			groupTreatment: "connector",
			header: "separator",
		});
	});
});
