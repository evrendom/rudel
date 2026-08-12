import { describe, expect, test } from "bun:test";
import {
	getCanonicalAppPath,
	getLeftSidebarAdalinePreviewPath,
	isLeftSidebarAdalinePreviewPath,
} from "./routes";

describe("Adaline session preview route", () => {
	test("round-trips a session detail path through the isolated namespace", () => {
		const canonicalPath = "/session/ddaf8fcb-d80e-4413-90ae-77ef076a3520";
		const previewPath = getLeftSidebarAdalinePreviewPath(canonicalPath);

		expect(previewPath).toBe(
			"/dev/left-sidebar-adaline/session/ddaf8fcb-d80e-4413-90ae-77ef076a3520",
		);
		expect(isLeftSidebarAdalinePreviewPath(previewPath)).toBe(true);
		expect(getCanonicalAppPath(previewPath)).toBe(canonicalPath);
	});
});
