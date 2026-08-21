import { describe, expect, test } from "vitest";
import {
	formatApiCost,
	formatCompactCurrency,
	formatCompactWholeCurrency,
	formatCurrency,
	formatWholeCurrency,
} from "./format";

describe("currency formatters", () => {
	test("render missing and invalid costs as numeric zero values", () => {
		expect(formatApiCost(undefined)).toBe("$0.00");
		expect(formatCurrency(null)).toBe("$0.00");
		expect(formatCurrency(Number.NaN)).toBe("$0.00");
		expect(formatCompactCurrency(undefined)).toBe("$0.00");
		expect(formatWholeCurrency(null)).toBe("$0");
		expect(formatCompactWholeCurrency(undefined)).toBe("$0");
	});

	test("formats API costs as cents below ten dollars and whole dollars above", () => {
		expect(formatApiCost(0.1267)).toBe("$0.13");
		expect(formatApiCost(9.876)).toBe("$9.88");
		expect(formatApiCost(10.49)).toBe("$10");
		expect(formatApiCost(10.5)).toBe("$11");
	});
});
