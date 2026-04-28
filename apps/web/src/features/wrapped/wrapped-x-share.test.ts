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
				"My Claude Code and Codex usage says I'm a Maniac.",
				"Traits: 1.9M tokens over 219 sessions; high session count, heavy token burn, no visible off switch.",
			].join("\n\n"),
		);
	});

	it("builds Roadrunner copy with active days and cost per session", () => {
		expect(
			buildWrappedXShareText({
				activeDays: 4,
				archetypeLabel: "Roadrunner",
				cost: 44,
				daysSinceFirst: 21,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 7,
						session_share_percent: 50,
						source: "claude_code",
					},
					{
						session_count: 7,
						session_share_percent: 50,
						source: "codex",
					},
				],
				totalSessions: 8,
				totalTokens: 92_000,
			}),
		).toBe(
			[
				"My Claude Code and Codex usage says I'm a Roadrunner.",
				"Meep meep.",
				"Active 4 out of 21 days.",
				"Meep meep.",
				"When back I'm spending $5.50 a session.",
				"Meep meep.",
				"Gone.",
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
		).toContain("My Codex usage says");

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
		).toContain("My Claude Code usage says");
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
		).toContain("My Codex usage says");
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
		expect(intentUrl.searchParams.get("text")).toBe(
			[
				"Share text",
				"Check my profile out here https://rudel.ai/wrapped",
				"[Your image is in your clipboard, pls paste and dont forget]",
			].join("\n\n"),
		);
		expect(intentUrl.searchParams.get("url")).toBeNull();
	});
});
