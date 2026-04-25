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
				"This is less a recap, more a wellness check.",
				"Evren's Wrapped came back Maniac: 1.9M tokens over 219 sessions, no chill detected.",
				"Make yours:",
			].join("\n\n"),
		);
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
