import { describe, expect, test } from "bun:test";
import {
	getCanonicalAppPath,
	getLeftSidebarThreadWaterfallPreviewPath,
	isLeftSidebarThreadWaterfallPreviewPath,
} from "./routes";

describe("thread waterfall preview route", () => {
	test("round-trips a session detail path through the isolated namespace", () => {
		const canonicalPath = "/session/ddaf8fcb-d80e-4413-90ae-77ef076a3520";
		const previewPath = getLeftSidebarThreadWaterfallPreviewPath(canonicalPath);

		expect(previewPath).toBe(
			"/dev/left-sidebar-thread-waterfall/session/ddaf8fcb-d80e-4413-90ae-77ef076a3520",
		);
		expect(isLeftSidebarThreadWaterfallPreviewPath(previewPath)).toBe(true);
		expect(getCanonicalAppPath(previewPath)).toBe(canonicalPath);
	});
});
