import { describe, expect, test } from "bun:test";
import {
	getNewseshLanguageSignals,
	getNewseshLanguageSignalTagLabel,
} from "./newsesh-session-language-signal";

describe("newsesh session language signal labels", () => {
	test("builds tags directly from persisted list-row counts", () => {
		const signals = getNewseshLanguageSignals({
			member_swears: 2,
			member_apologies: 0,
			member_positive: 1,
			model_swears: 0,
			model_apologies: 3,
			model_positive: 0,
		});

		expect(signals.map(getNewseshLanguageSignalTagLabel)).toEqual([
			"model apologized +2",
			"you swore +1",
			"you praised",
		]);
	});

	test("returns no tags when every persisted count is zero", () => {
		expect(
			getNewseshLanguageSignals({
				member_swears: 0,
				member_apologies: 0,
				member_positive: 0,
				model_swears: 0,
				model_apologies: 0,
				model_positive: 0,
			}),
		).toEqual([]);
	});
});
