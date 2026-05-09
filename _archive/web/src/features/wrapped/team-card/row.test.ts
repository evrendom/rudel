import type { DeveloperDetails, WrappedV1 } from "@rudel/api-routes";
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

	it("keeps the visible card on the freshest wrapped totals when developer details lag", () => {
		const row = buildResolvedTeamCardRow({
			accountLabel: "Session User",
			developerDetails: createDeveloperDetails({
				active_days: 9,
				cost: 42,
				favorite_model: "recent-model",
				total_sessions: 73,
				total_tokens: 12_000,
			}),
			guestPreviewDisplayName: undefined,
			guestPreviewImageUrl: undefined,
			profileImageFallbackSrc: "/favicon-dark.png",
			sessionUserEmail: "session@example.com",
			sessionUserId: "user_1",
			sessionUserImage: undefined,
			sessionUserName: "Session User",
			teamMemberRows: [],
			wrappedMetrics: createWrappedMetrics({
				active_days: 14,
				estimated_spend_usd: 91,
				favorite_model: "all-time-model",
				total_sessions: 135,
				total_tokens: 38_000,
			}),
		});

		expect(row.totalSessions).toBe(135);
		expect(row.activeDays).toBe(14);
		expect(row.totalTokens).toBe(38_000);
		expect(row.cost).toBe(91);
		expect(row.favoriteModel).toBe("all-time-model");
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

function createDeveloperDetails(
	overrides: Partial<DeveloperDetails> = {},
): DeveloperDetails {
	return {
		active_days: 1,
		avg_session_duration_min: 10,
		cost: 1,
		distinct_projects: 1,
		error_count: 0,
		favorite_model: null,
		input_tokens: 100,
		last_active_date: "2026-04-21",
		output_tokens: 200,
		success_rate: 100,
		success_rate_trend: 0,
		total_duration_min: 10,
		total_sessions: 1,
		total_tokens: 300,
		user_id: "user_1",
		...overrides,
	} satisfies DeveloperDetails;
}

function createWrappedMetrics(
	overrides: Partial<WrappedV1["metrics"]> = {},
): WrappedV1["metrics"] {
	return {
		active_days: 1,
		days_since_first_session: 1,
		estimated_spend_usd: 1,
		favorite_model: null,
		first_session_at: "2026-04-20T00:00:00Z",
		last_session_at: "2026-04-21T00:00:00Z",
		longest_session_min: 10,
		model_by_month: [],
		source_split: [],
		total_sessions: 1,
		total_tokens: 300,
		...overrides,
	} satisfies WrappedV1["metrics"];
}
