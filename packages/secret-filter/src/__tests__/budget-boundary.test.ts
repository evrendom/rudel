import { describe, expect, test } from "bun:test";
import {
	filterKnownSecrets,
	getRedactionBudgetAnomaly,
	MAX_REDACTION_RATIO,
	OVERLONG_MATCH_THRESHOLD_BYTES,
	OVERLONG_REDACTION_RULE_ID,
} from "../index.js";

const COUNTS = { "aws-access-key-id": 1 };
const SLACK_PREFIX = "xoxb-1234567890-1234567890-";

describe("exactly 20 percent versus one byte over", () => {
	test("the ratio constant the boundary table encodes is 20 percent", () => {
		expect(MAX_REDACTION_RATIO).toBe(0.2);
	});

	const boundaries: readonly {
		readonly inputBytes: number;
		readonly atBudget: number;
		readonly overBudget: number;
	}[] = [
		{ inputBytes: 5, atBudget: 1, overBudget: 2 },
		{ inputBytes: 100, atBudget: 20, overBudget: 21 },
		// 8192 * 0.2 = 1638.4: the integer boundary sits on a fractional budget.
		{ inputBytes: 8192, atBudget: 1638, overBudget: 1639 },
		{ inputBytes: 1_000_000, atBudget: 200_000, overBudget: 200_001 },
	];

	for (const boundary of boundaries) {
		test(`${boundary.inputBytes}B input allows ${boundary.atBudget}B and flags ${boundary.overBudget}B`, () => {
			expect(
				getRedactionBudgetAnomaly(
					boundary.atBudget,
					boundary.inputBytes,
					COUNTS,
				),
			).toBeNull();
			expect(
				getRedactionBudgetAnomaly(
					boundary.overBudget,
					boundary.inputBytes,
					COUNTS,
				),
			).toEqual({
				inputBytes: boundary.inputBytes,
				redactedBytes: boundary.overBudget,
				ruleIds: ["aws-access-key-id"],
			});
		});
	}

	test("fractional budgets floor to the last allowed integer byte", () => {
		// 7 * 0.2 = 1.4 and 9 * 0.2 = 1.8: one byte passes, two bytes breach.
		for (const inputBytes of [7, 9]) {
			expect(getRedactionBudgetAnomaly(1, inputBytes, COUNTS)).toBeNull();
			expect(getRedactionBudgetAnomaly(2, inputBytes, COUNTS)).not.toBeNull();
		}
		// 3 * 0.2 = 0.6: any redaction at all already breaches.
		expect(getRedactionBudgetAnomaly(1, 3, COUNTS)).toEqual({
			inputBytes: 3,
			redactedBytes: 1,
			ruleIds: ["aws-access-key-id"],
		});
		// 8191 * 0.2 = 1638.2.
		expect(getRedactionBudgetAnomaly(1638, 8191, COUNTS)).toBeNull();
		expect(getRedactionBudgetAnomaly(1639, 8191, COUNTS)).not.toBeNull();
	});

	test("a fully redacted input is flagged", () => {
		expect(getRedactionBudgetAnomaly(100, 100, COUNTS)).toEqual({
			inputBytes: 100,
			redactedBytes: 100,
			ruleIds: ["aws-access-key-id"],
		});
	});

	test("an overlong match uses its full size at and above the budget", () => {
		const secret = `${SLACK_PREFIX}${"A".repeat(
			OVERLONG_MATCH_THRESHOLD_BYTES + 1 - SLACK_PREFIX.length,
		)}`;
		const atBudgetContent = `${secret}${".".repeat(secret.length * 4)}`;
		const overBudgetContent = atBudgetContent.slice(0, -1);
		const atBudget = filterKnownSecrets(atBudgetContent);
		const overBudget = filterKnownSecrets(overBudgetContent);

		expect(atBudget.text).not.toContain(secret);
		expect(atBudget.redactedBytes).toBe(OVERLONG_MATCH_THRESHOLD_BYTES + 1);
		expect(atBudget.counts).toEqual({
			"slack-bot-token": 1,
			[OVERLONG_REDACTION_RULE_ID]: 1,
		});
		expect(
			getRedactionBudgetAnomaly(
				atBudget.redactedBytes,
				atBudgetContent.length,
				atBudget.counts,
			),
		).toBeNull();
		expect(
			getRedactionBudgetAnomaly(
				overBudget.redactedBytes,
				overBudgetContent.length,
				overBudget.counts,
			),
		).toEqual({
			inputBytes: overBudgetContent.length,
			redactedBytes: OVERLONG_MATCH_THRESHOLD_BYTES + 1,
			ruleIds: ["overlong-match", "slack-bot-token"],
		});
	});
});

describe("zero and degenerate inputs return null", () => {
	// The null contract belongs to getRedactionBudgetAnomaly alone.
	// filterKnownSecrets always returns a result object — pinned below so the
	// two contracts cannot be conflated.
	test("no redaction, empty input, and negative sizes are all null", () => {
		expect(getRedactionBudgetAnomaly(0, 0, {})).toBeNull();
		expect(getRedactionBudgetAnomaly(0, 100, {})).toBeNull();
		expect(getRedactionBudgetAnomaly(20, 0, COUNTS)).toBeNull();
		expect(getRedactionBudgetAnomaly(20, -1, COUNTS)).toBeNull();
		expect(getRedactionBudgetAnomaly(-1, 100, COUNTS)).toBeNull();
	});

	test("filterKnownSecrets never goes null on degenerate input", () => {
		expect(filterKnownSecrets("")).toEqual({
			text: "",
			counts: {},
			redactedBytes: 0,
		});
	});
});

describe("anomaly ruleIds", () => {
	test("ruleIds come back sorted regardless of counts insertion order", () => {
		const anomaly = getRedactionBudgetAnomaly(50, 100, {
			"twilio-api-key": 2,
			"aws-access-key-id": 1,
			"gitlab-pat": 1,
		});

		expect(anomaly?.ruleIds).toEqual([
			"aws-access-key-id",
			"gitlab-pat",
			"twilio-api-key",
		]);
	});

	test("zero-count rules are excluded from ruleIds", () => {
		const anomaly = getRedactionBudgetAnomaly(50, 100, {
			"openai-api-key": 0,
			"twilio-api-key": 1,
		});

		expect(anomaly?.ruleIds).toEqual(["twilio-api-key"]);
	});
});
