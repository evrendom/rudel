import { describe, expect, it } from "vitest";
import { buildResolvedTeamCardRow } from "./row";

describe("buildResolvedTeamCardRow", () => {
	it("uses the guest preview name and image for card personalization", () => {
		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			developerDetails: undefined,
			guestPreviewDisplayName: "Ada Lovelace",
			profileImageSrc: "data:image/png;base64,abc",
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserName: "Session User",
			teamMemberRows: [],
			wrappedMetrics: undefined,
		});

		expect(row.displayName).toBe("Ada Lovelace");
		expect(row.imageUrl).toBe("data:image/png;base64,abc");
	});

	it("leaves the card image empty when the profile has no picture", () => {
		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			developerDetails: undefined,
			guestPreviewDisplayName: "Ada Lovelace",
			profileImageSrc: null,
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserName: "Session User",
			teamMemberRows: [],
			wrappedMetrics: undefined,
		});

		expect(row.imageUrl).toBeNull();
	});

	it("preserves the team member image when no profile override exists", () => {
		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			developerDetails: undefined,
			guestPreviewDisplayName: undefined,
			profileImageSrc: undefined,
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserName: "Session User",
			teamMemberRows: [
				{
					activeDays: 4,
					cost: 12,
					displayName: "Session User",
					email: "session@example.com",
					favoriteModel: null,
					hasActivity: true,
					imageUrl: "https://example.com/avatar.png",
					inputTokens: 10,
					lastActiveDate: null,
					outputTokens: 20,
					role: "Member",
					totalSessions: 3,
					totalTokens: 30,
					userId: "user_1",
				},
			],
			wrappedMetrics: undefined,
		});

		expect(row.imageUrl).toBe("https://example.com/avatar.png");
	});
});
