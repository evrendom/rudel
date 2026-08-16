import { describe, expect, test } from "vitest";
import {
	formatCompactCurrency,
	formatCompactWholeCurrency,
	formatCurrency,
	formatWholeCurrency,
} from "./format";

describe("currency formatters", () => {
	test("render missing and invalid costs as numeric zero values", () => {
		expect(formatCurrency(null)).toBe("$0.00");
		expect(formatCurrency(Number.NaN)).toBe("$0.00");
		expect(formatCompactCurrency(undefined)).toBe("$0.00");
		expect(formatWholeCurrency(null)).toBe("$0");
		expect(formatCompactWholeCurrency(undefined)).toBe("$0");
	});
});
