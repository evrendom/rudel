import { describe, expect, it } from "vitest";
import {
	buildResolvedTeamCardRow,
	resolveTeamCardProfileImageSrc,
} from "./row";

describe("buildResolvedTeamCardRow", () => {
	it("uses the guest preview name and image for card personalization", () => {
		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			developerDetails: undefined,
			guestPreviewDisplayName: "Ada Lovelace",
			guestPreviewImageUrl: "data:image/png;base64,abc",
			profileImageFallbackSrc: "/favicon-dark.png",
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserImage: undefined,
			sessionUserName: "Session User",
			teamMemberRows: [],
			wrappedMetrics: undefined,
		});

		expect(row.displayName).toBe("Ada Lovelace");
		expect(row.imageUrl).toBe("data:image/png;base64,abc");
	});

	it("uses the session profile image when the user skipped profile editing", () => {
		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			developerDetails: undefined,
			guestPreviewDisplayName: undefined,
			guestPreviewImageUrl: undefined,
			profileImageFallbackSrc: "/favicon-dark.png",
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserImage: "https://avatars.githubusercontent.com/u/1?v=4",
			sessionUserName: "Session User",
			teamMemberRows: [],
			wrappedMetrics: undefined,
		});

		expect(row.displayName).toBe("Session User");
		expect(row.imageUrl).toBe("https://avatars.githubusercontent.com/u/1?v=4");
	});

	it("keeps edited profile images ahead of session profile images", () => {
		expect(
			resolveTeamCardProfileImageSrc({
				fallbackSrc: "/favicon-dark.png",
				guestPreviewImageUrl: "data:image/png;base64,abc",
				sessionUserImage: "https://lh3.googleusercontent.com/avatar",
			}),
		).toBe("data:image/png;base64,abc");
	});

	it("falls back to the handover avatar when no profile image exists", () => {
		expect(
			resolveTeamCardProfileImageSrc({
				fallbackSrc: "/favicon-dark.png",
				guestPreviewImageUrl: null,
				sessionUserImage: undefined,
			}),
		).toBe("/favicon-dark.png");
	});
});
