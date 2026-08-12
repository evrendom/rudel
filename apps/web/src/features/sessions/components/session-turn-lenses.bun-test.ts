import { describe, expect, test } from "bun:test";
import { getSessionTurnLensMatches } from "./session-turn-lenses";
import { createSessionTurnV2TestOption } from "./session-turn-v2-test-fixtures";

describe("session turn lenses", () => {
	test("uses the top defined cost decile and ignores missing pricing", () => {
		const options = Array.from({ length: 10 }, (_, index) => {
			const base = createSessionTurnV2TestOption();
			return createSessionTurnV2TestOption({
				key: `turn-${index}`,
				metrics: {
					...base.metrics,
					estimatedCost: index === 0 ? undefined : index,
				},
			});
		});
		expect([...getSessionTurnLensMatches(options, "expensive")]).toEqual([9]);
	});

	test("detects friction in untruncated member text", () => {
		const longPrompt = `${"calm ".repeat(80)}this is still broken`;
		expect([
			...getSessionTurnLensMatches(
				[createSessionTurnV2TestOption({ memberText: longPrompt })],
				"friction",
			),
		]).toEqual([0]);
	});

	test("does not match commands on the preamble", () => {
		expect(
			getSessionTurnLensMatches(
				[
					createSessionTurnV2TestOption({
						slashCommands: ["review"],
						turnNumber: undefined,
					}),
				],
				"commands",
			).size,
		).toBe(0);
	});
});
