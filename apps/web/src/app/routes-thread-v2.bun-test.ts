import { describe, expect, test } from "bun:test";
import {
	getCanonicalAppPath,
	getLeftSidebarThreadV2PreviewPath,
	isLeftSidebarThreadV2PreviewPath,
} from "./routes";

describe("thread v2 preview route", () => {
	test("round-trips a session detail path through the isolated namespace", () => {
		const canonicalPath = "/session/ddaf8fcb-d80e-4413-90ae-77ef076a3520";
		const previewPath = getLeftSidebarThreadV2PreviewPath(canonicalPath);

		expect(previewPath).toBe(
			"/dev/left-sidebar-thread-v2/session/ddaf8fcb-d80e-4413-90ae-77ef076a3520",
		);
		expect(isLeftSidebarThreadV2PreviewPath(previewPath)).toBe(true);
		expect(getCanonicalAppPath(previewPath)).toBe(canonicalPath);
	});
});
