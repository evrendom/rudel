import { describe, expect, it } from "vitest";
import {
	buildWrappedShareSafeRow,
	getWrappedShareSafeImageUrl,
} from "./share-media";

describe("wrapped share media policy", () => {
	it("keeps same-origin images for export and public replay", () => {
		expect(
			getWrappedShareSafeImageUrl(
				"https://rudel.ai/uploads/avatar.png",
				"https://rudel.ai",
			),
		).toBe("https://rudel.ai/uploads/avatar.png");
	});

	it("keeps relative images for export and public replay", () => {
		expect(
			getWrappedShareSafeImageUrl("/uploads/avatar.png", "https://rudel.ai"),
		).toBe("https://rudel.ai/uploads/avatar.png");
	});

	it("drops third-party images from the share-safe surface", () => {
		expect(
			getWrappedShareSafeImageUrl(
				"https://avatars.githubusercontent.com/u/1?v=4",
				"https://rudel.ai",
			),
		).toBeNull();
	});

	it("keeps data and blob urls for designer-controlled local media", () => {
		expect(
			getWrappedShareSafeImageUrl(
				"data:image/png;base64,abc",
				"https://rudel.ai",
			),
		).toBe("data:image/png;base64,abc");
		expect(
			getWrappedShareSafeImageUrl(
				"blob:https://rudel.ai/1234",
				"https://rudel.ai",
			),
		).toBe("blob:https://rudel.ai/1234");
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
			imageUrl: null,
		});
	});
});
