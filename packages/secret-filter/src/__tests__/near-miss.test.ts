import { describe, expect, test } from "bun:test";
import { GENERATED_SECRET_RULES } from "../generated-rules.js";
import { filterKnownSecrets } from "../index.js";
import {
	CANONICAL_SECRETS,
	NEAR_MISS_MUTATIONS,
} from "./helpers/rule-corpus.js";

const pureNegatives = NEAR_MISS_MUTATIONS.filter(
	(mutation) => mutation.expectedSiblingRuleId === undefined,
);
const siblingMatches = NEAR_MISS_MUTATIONS.filter(
	(mutation) => mutation.expectedSiblingRuleId !== undefined,
);

describe("near-miss mutations pass through byte-identically", () => {
	for (const mutation of pureNegatives) {
		test(`${mutation.ruleId} ${mutation.kind} is not redacted`, () => {
			// Bare (end-of-input gives delimiter-anchored rules their $ anchor)
			// and assignment-prefixed — the mutant must survive both.
			for (const input of [mutation.value, `token=${mutation.value}`]) {
				expect(filterKnownSecrets(input)).toEqual({
					text: input,
					counts: {},
					redactedBytes: 0,
				});
			}
		});
	}
});

describe("triaged sibling matches", () => {
	/**
	 * These mutations land on a syntactically valid token of a different rule,
	 * so the filter redacts them as that sibling. That is correct behaviour —
	 * the mutant IS a live-looking secret of the sibling type — encoded here
	 * so the redaction is explicit rather than hidden in a skipped negative.
	 */
	for (const mutation of siblingMatches) {
		const sibling = mutation.expectedSiblingRuleId ?? "";

		test(`${mutation.ruleId} ${mutation.kind} is redacted as ${sibling}`, () => {
			const input = `token=${mutation.value}`;
			const result = filterKnownSecrets(input);

			expect(result.text).toBe(`token=[REDACTED:${sibling}]`);
			expect(result.counts).toEqual({ [sibling]: 1 });
			expect(result.text).not.toContain(mutation.value);
		});
	}

	test("the triaged set is exactly the three known prefix collisions", () => {
		expect(
			siblingMatches.map(
				(mutation) => `${mutation.ruleId}->${mutation.expectedSiblingRuleId}`,
			),
		).toEqual([
			"github-app-token->github-oauth",
			"github-oauth->github-pat",
			"slack-user-token->slack-bot-token",
		]);
	});
});

describe("mutation corpus shape", () => {
	test("every generated rule has at least four mutations", () => {
		for (const rule of GENERATED_SECRET_RULES) {
			const mutations = NEAR_MISS_MUTATIONS.filter(
				(mutation) => mutation.ruleId === rule.id,
			);

			expect(mutations.length).toBeGreaterThanOrEqual(4);
		}
	});

	test("no pure negative equals a canonical live secret", () => {
		// Sibling mutants are excluded on purpose: a one-letter prefix mutation
		// that lands on the sibling's canonical canary is exactly the finding
		// they encode.
		const liveSecrets = new Set(CANONICAL_SECRETS.map((c) => c.secret));

		for (const mutation of pureNegatives) {
			expect(liveSecrets.has(mutation.value)).toBe(false);
		}
	});
});
