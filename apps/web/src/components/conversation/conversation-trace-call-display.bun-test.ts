import { describe, expect, test } from "bun:test";
import {
	formatTraceCallContext,
	getTraceCallDisplayConfig,
	shouldRenderTraceCallHeader,
} from "./conversation-trace-call-display";

describe("conversation trace call display", () => {
	test("keeps request details visible in request mode", () => {
		const config = getTraceCallDisplayConfig("request");
		expect(config.flatRequestRows).toBe(false);
		expect(shouldRenderTraceCallHeader(config, 1)).toBe(true);
	});

	test("flattens request details in normal mode", () => {
		const config = getTraceCallDisplayConfig("normal");
		expect(config.flatRequestRows).toBe(true);
		expect(shouldRenderTraceCallHeader(config, 2)).toBe(false);
	});

	test("formats context totals and deltas", () => {
		expect(formatTraceCallContext(24_000, undefined)).toBe("ctx 24k");
		expect(formatTraceCallContext(30_000, 24_000)).toBe("+6.0k ctx");
		expect(formatTraceCallContext(20_000, 24_000)).toBe("−4.0k ctx");
	});
});
