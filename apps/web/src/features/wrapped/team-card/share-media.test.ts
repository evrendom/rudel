import { describe, expect, it } from "vitest";
import {
	buildWrappedShareSafeRow,
	getWrappedShareSafeImageUrl,
} from "./share-media";

describe("wrapped share media policy", () => {
	it("keeps the relative avatar path so the share page resolves it at render time", () => {
		expect(
			getWrappedShareSafeImageUrl(
				"/api/avatar/12345678-1234-1234-1234-123456789abc",
			),
		).toBe("/api/avatar/12345678-1234-1234-1234-123456789abc");
	});

	it("rejects relative paths that are not avatar urls", () => {
		expect(getWrappedShareSafeImageUrl("/foo")).toBeNull();
		expect(getWrappedShareSafeImageUrl("/uploads/avatar.png")).toBeNull();
		expect(getWrappedShareSafeImageUrl("/api/avatar/not-a-uuid")).toBeNull();
	});

	it("keeps HTTPS provider images for public replay", () => {
		expect(
			getWrappedShareSafeImageUrl(
				"https://avatars.githubusercontent.com/u/1?v=4",
			),
		).toBe("https://avatars.githubusercontent.com/u/1?v=4");
	});

	it("drops insecure third-party images from the share-safe surface", () => {
		expect(
			getWrappedShareSafeImageUrl("http://avatars.example.com/u/1.png"),
		).toBeNull();
	});

	it("keeps data and blob urls for designer-controlled local media", () => {
		expect(getWrappedShareSafeImageUrl("data:image/png;base64,abc")).toBe(
			"data:image/png;base64,abc",
		);
		expect(getWrappedShareSafeImageUrl("blob:https://rudel.ai/1234")).toBe(
			"blob:https://rudel.ai/1234",
		);
	});

	it("rejects empty/null/whitespace input", () => {
		expect(getWrappedShareSafeImageUrl(null)).toBeNull();
		expect(getWrappedShareSafeImageUrl(undefined)).toBeNull();
		expect(getWrappedShareSafeImageUrl("")).toBeNull();
	});

	it("builds a share-safe row without mutating unrelated card fields", () => {
		const row = {
			activeDays: 12,
			cost: 42,
			displayName: "Evr",
			email: null,
			favoriteModel: "Claude",
			hasActivity: true,
			imageUrl: "https://avatars.githubusercontent.com/u/1?v=4",
			inputTokens: 10,
			lastActiveDate: "2026-04-21",
			outputTokens: 20,
			role: "Member",
			totalSessions: 4,
			totalTokens: 30,
			userId: "user-1",
		};

		expect(buildWrappedShareSafeRow(row)).toEqual({
			...row,
			imageUrl: "https://avatars.githubusercontent.com/u/1?v=4",
		});
	});
});
