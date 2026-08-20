import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	buildTraceTextPreview,
	isTraceTextCollapsible,
	TRACE_TEXT_COLLAPSE_CHARACTER_LIMIT,
	TraceTextCollapsedPreview,
} from "./conversation-trace-text-disclosure";

describe("trace text disclosure", () => {
	it("only makes text beyond 1,500 Unicode characters collapsible", () => {
		expect(isTraceTextCollapsible("x".repeat(1_500))).toBe(false);
		expect(isTraceTextCollapsible("x".repeat(1_501))).toBe(true);
		expect(
			isTraceTextCollapsible("🙂".repeat(TRACE_TEXT_COLLAPSE_CHARACTER_LIMIT)),
		).toBe(false);
		expect(
			isTraceTextCollapsible(
				"🙂".repeat(TRACE_TEXT_COLLAPSE_CHARACTER_LIMIT + 1),
			),
		).toBe(true);
	});

	it("keeps at most five later signal instances in source order", () => {
		const text = `${"ordinary text ".repeat(140)} sorry, this didn't work, fuck, good, love, shit`;
		const preview = buildTraceTextPreview(text);

		expect(preview.omitted).toBe(true);
		expect(preview.trailingSignals.map((signal) => signal.matchedText)).toEqual(
			["sorry", "didn't work", "fuck", "good", "love"],
		);
		expect(preview.trailingSignals.map((signal) => signal.gapBefore)).toEqual([
			true,
			true,
			true,
			true,
			true,
		]);
	});

	it("only inserts omission separators when source text exists between signals", () => {
		const preview = buildTraceTextPreview(
			`${"ordinary ".repeat(200)} sorry great, then fuck`,
		);

		expect(
			preview.trailingSignals.map(({ gapBefore, matchedText }) => ({
				gapBefore,
				matchedText,
			})),
		).toEqual([
			{ gapBefore: true, matchedText: "sorry" },
			{ gapBefore: false, matchedText: "great" },
			{ gapBefore: true, matchedText: "fuck" },
		]);
	});

	it("renders the omission marker and later signals with their existing tags", () => {
		render(
			<TraceTextCollapsedPreview
				text={`${"ordinary ".repeat(200)} sorry and great`}
			/>,
		);

		expect(screen.getAllByText("[…]")).toHaveLength(2);
		expect(screen.getByText("sorry")).toHaveAttribute("data-signal", "apology");
		expect(screen.getByText("great")).toHaveAttribute(
			"data-signal",
			"positive",
		);
	});
});
