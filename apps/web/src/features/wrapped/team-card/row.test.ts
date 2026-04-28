import { describe, expect, it } from "vitest";
import { buildResolvedTeamCardRow } from "./row";

describe("buildResolvedTeamCardRow", () => {
	it("uses the guest preview name and image for card personalization", () => {
		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			debugProfileImageSrc: "data:image/png;base64,abc",
			developerDetails: undefined,
			guestPreviewDisplayName: "Ada Lovelace",
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserName: "Session User",
			teamMemberRows: [],
			wrappedMetrics: undefined,
		});

		expect(row.displayName).toBe("Ada Lovelace");
		expect(row.imageUrl).toBe("data:image/png;base64,abc");
	});
});
