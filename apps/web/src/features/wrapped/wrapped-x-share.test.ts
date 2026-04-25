import { describe, expect, it } from "vitest";
import {
	buildWrappedXIntentUrl,
	buildWrappedXShareText,
} from "@/features/wrapped/wrapped-x-share";

describe("wrapped X share copy", () => {
	it("builds archetype-specific copy with compact metrics", () => {
		expect(
			buildWrappedXShareText({
				archetypeLabel: "Maniac",
				displayName: "Evren",
				totalSessions: 219,
				totalTokens: 1_920_000,
			}),
		).toBe(
			[
				"According to my Claude / Codex usage, I'm a Maniac.",
				"Traits: 1.9M tokens over 219 sessions; high session count, heavy token burn, no visible off switch.",
				"Make yours: app.rudel.ai/wrapped",
			].join("\n\n"),
		);
	});

	it("collapses the usage source when only one tracked source has activity", () => {
		expect(
			buildWrappedXShareText({
				archetypeLabel: "Roadrunner",
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 0,
						session_share_percent: 0,
						source: "claude_code",
					},
					{
						session_count: 42,
						session_share_percent: 100,
						source: "codex",
					},
				],
				totalSessions: 42,
				totalTokens: 92_000,
			}),
		).toContain("According to my Codex usage");

		expect(
			buildWrappedXShareText({
				archetypeLabel: "Decimal",
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 27,
						session_share_percent: 100,
						source: "claude_code",
					},
					{
						session_count: 0,
						session_share_percent: 0,
						source: "codex",
					},
				],
				totalSessions: 27,
				totalTokens: 64_000,
			}),
		).toContain("According to my Claude usage");
	});

	it("falls back to favorite model when source split is unavailable", () => {
		expect(
			buildWrappedXShareText({
				archetypeLabel: "Smooth Operator",
				displayName: "Evren",
				favoriteModel: "gpt-5.3-codex",
				totalSessions: 19,
				totalTokens: 41_000,
			}),
		).toContain("According to my Codex usage");
	});

	it("builds an X intent URL with text and wrapped URL", () => {
		const intentUrl = new URL(
			buildWrappedXIntentUrl({
				text: "Share text",
				url: "https://rudel.ai/wrapped",
			}),
		);

		expect(`${intentUrl.origin}${intentUrl.pathname}`).toBe(
			"https://twitter.com/intent/tweet",
		);
		expect(intentUrl.searchParams.get("text")).toBe("Share text");
		expect(intentUrl.searchParams.get("url")).toBe("https://rudel.ai/wrapped");
	});
});
