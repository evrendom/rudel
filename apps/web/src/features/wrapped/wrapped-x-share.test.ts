import { describe, expect, it } from "vitest";
import {
	buildWrappedXIntentUrl,
	buildWrappedXShareText,
} from "@/features/wrapped/wrapped-x-share";

const WRAPPED_X_SHARE_HASHTAG = "#RudelWrapped";

function withWrappedHashtag(text: string) {
	return [text, WRAPPED_X_SHARE_HASHTAG].join("\n\n");
}

describe("wrapped X share copy", () => {
	it("builds Maniac copy with activity, repo, and session density metrics", () => {
		expect(
			buildWrappedXShareText({
				activeDays: 12,
				archetypeLabel: "Maniac",
				daysSinceFirst: 180,
				distinctProjectCount: 6,
				displayName: "Evren",
				totalSessions: 219,
				totalTokens: 1_920_000,
			}),
		).toBe(
			withWrappedHashtag(
				[
					"My Claude Code and Codex usage says I'm a Maniac.",
					"Active 12 out of 180 days, 6 repos, 18.3 sessions per active day. Yeah, you should be a little scared.",
				].join(" "),
			),
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
			withWrappedHashtag(
				[
					"My Claude Code and Codex usage says I'm a Roadrunner.",
					"Meep meep.",
					"Active 4 out of 21 days.",
					"Meep meep.",
					"When back I'm spending $5.50 a session.",
					"Meep meep.",
					"Gone.",
				].join("\n\n"),
			),
		);
	});

	it("builds Obsessed copy with repo, activity, and commit metrics", () => {
		expect(
			buildWrappedXShareText({
				activeDays: 58,
				archetypeLabel: "Obsessed",
				commitRate: 48,
				daysSinceFirst: 214,
				distinctProjectCount: 1,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 125,
						session_share_percent: 57,
						source: "claude_code",
					},
					{
						session_count: 94,
						session_share_percent: 43,
						source: "codex",
					},
				],
			}),
		).toBe(
			withWrappedHashtag(
				"My Claude Code and Codex usage says I'm Obsessed. 1 repo, 58 out of 214 days, 48% of sessions shipped something. Apparently I have nothing else in my life. I dare you to distract me.",
			),
		);
	});

	it("builds Company Card copy with spend metrics and source-specific names", () => {
		expect(
			buildWrappedXShareText({
				archetypeLabel: "Company Card",
				commitRate: 48,
				cost: 44,
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
			}),
		).toBe(
			withWrappedHashtag(
				"My Claude Code and Codex usage says I got the Company Card... 8 sessions, 48% shipped something, $44 in total. Dario & Sam are probably happy to have me.",
			),
		);

		expect(
			buildWrappedXShareText({
				archetypeLabel: "Company Card",
				commitRate: 48,
				cost: 44,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 8,
						session_share_percent: 100,
						source: "claude_code",
					},
				],
				totalSessions: 8,
			}),
		).toBe(
			withWrappedHashtag(
				"My Claude Code usage says I got the Company Card... 8 sessions, 48% shipped something, $44 in total. Dario's probably happy to have me.",
			),
		);

		expect(
			buildWrappedXShareText({
				archetypeLabel: "Company Card",
				commitRate: 48,
				cost: 44,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 8,
						session_share_percent: 100,
						source: "codex",
					},
				],
				totalSessions: 8,
			}),
		).toBe(
			withWrappedHashtag(
				"My Codex usage says I got the Company Card... 8 sessions, 48% shipped something, $44 in total. Sam's probably happy to have me.",
			),
		);
	});

	it("builds Smooth Operator copy with cadence metrics", () => {
		expect(
			buildWrappedXShareText({
				activeDays: 12,
				archetypeLabel: "Smooth Operator",
				avgSessionMin: 24,
				daysSinceFirst: 180,
				displayName: "Evren",
				favoriteModel: "gpt-5.3-codex",
				totalSessions: 37,
			}),
		).toBe(
			withWrappedHashtag(
				"My Codex usage says I'm a Smooooooth Operator. Active 12 out of 180 days, 24 minute average session, 3.1 a day. Haters gonna try to find something on me, but they can't because I'm a smooooth operator.",
			),
		);
	});

	it("builds ADHD Brain copy with activity, repo, and commit metrics", () => {
		expect(
			buildWrappedXShareText({
				activeDays: 12,
				archetypeLabel: "ADHD Brain",
				commitRate: 48,
				daysSinceFirst: 180,
				distinctProjectCount: 6,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 21,
						session_share_percent: 57,
						source: "claude_code",
					},
					{
						session_count: 16,
						session_share_percent: 43,
						source: "codex",
					},
				],
			}),
		).toBe(
			withWrappedHashtag(
				"My Claude Code and Codex usage says I'm an ADHD Brain. 12 out of 180 days, 6 repos, 48% shipped. DaVinci also had many projects! I'm his reincarnation.. i guess.",
			),
		);
	});

	it("builds Hit and Runner copy with session, repo, and commit metrics", () => {
		expect(
			buildWrappedXShareText({
				archetypeLabel: "Hit and Runner",
				avgSessionMin: 24,
				commitRate: 48,
				distinctProjectCount: 6,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 42,
						session_share_percent: 100,
						source: "codex",
					},
				],
			}),
		).toBe(
			withWrappedHashtag(
				"My Codex usage says I'm a Hit and Runner. 24 minute sessions, 6 repos, 48% shipped. Veni, vidi, commit. In, out, no witnesses.",
			),
		);
	});

	it("builds Cheapskate copy with cost per session and commit metrics", () => {
		expect(
			buildWrappedXShareText({
				archetypeLabel: "Cheapskate",
				commitRate: 48,
				cost: 44,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 42,
						session_share_percent: 100,
						source: "codex",
					},
				],
				totalSessions: 8,
			}),
		).toBe(
			withWrappedHashtag(
				"My Codex usage says I'm a Cheapskate. $5.50 a session, 48% shipped. Mr. Krabs is very proud of me. Spent less, shipped more. Very efficient. Pls don't ask me to pay for dinner though.",
			),
		);
	});

	it("builds Tourist copy with total spend and source-specific fallback product", () => {
		expect(
			buildWrappedXShareText({
				archetypeLabel: "Tourist",
				commitRate: 48,
				cost: 44,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 42,
						session_share_percent: 100,
						source: "codex",
					},
				],
				totalSessions: 8,
			}),
		).toBe(
			withWrappedHashtag(
				"My Codex usage says I'm a Tourist. 8 sessions, 48% shipped, $44 spent in total.. I'm definitely not the person who'll get prompt injected by this OpenClaw thing. I'll stick to ChatGPT",
			),
		);

		expect(
			buildWrappedXShareText({
				archetypeLabel: "Tourist",
				commitRate: 48,
				cost: 44,
				displayName: "Evren",
				sourceSplit: [
					{
						session_count: 8,
						session_share_percent: 50,
						source: "claude_code",
					},
					{
						session_count: 8,
						session_share_percent: 50,
						source: "codex",
					},
				],
				totalSessions: 8,
			}),
		).toBe(
			withWrappedHashtag(
				"My Claude Code and Codex usage says I'm a Tourist. 8 sessions, 48% shipped, $44 spent in total.. I'm definitely not the person who'll get prompt injected by this OpenClaw thing. I'll stick to Claude",
			),
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
