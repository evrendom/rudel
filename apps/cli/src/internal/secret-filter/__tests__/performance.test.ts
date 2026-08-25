import { expect, test } from "bun:test";
import {
	type CompiledSecretRule,
	filterKnownSecretsWithCompiledRules,
} from "../filter.js";
import { filterKnownSecrets } from "../index.js";

const TEN_MB_OF_PROSE = "ordinary transcript content\n".repeat(
	Math.ceil((10 * 1024 * 1024) / 28),
);

test("filters a 10 MB transcript in low single-digit seconds", () => {
	const start = performance.now();
	const result = filterKnownSecrets(TEN_MB_OF_PROSE);
	const durationMs = performance.now() - start;

	expect(result.text).toBe(TEN_MB_OF_PROSE);
	expect(result.counts).toEqual({});
	expect(durationMs).toBeLessThan(5_000);
});

test("filters a 10 MB transcript containing a secret within ten seconds", () => {
	const withSecret = `${TEN_MB_OF_PROSE}AKIACANARY234567ABCDSK${"ab".repeat(16)}`;

	const secretStart = performance.now();
	const result = filterKnownSecrets(withSecret);
	const secretMs = performance.now() - secretStart;

	expect(result.counts).toEqual({
		"aws-access-key-id": 1,
		"twilio-api-key": 1,
	});
	expect(secretMs).toBeLessThan(10_000);
}, 20_000);

test("a clean transcript stops after one rule fold", () => {
	const definition: CompiledSecretRule["definition"] = {
		id: "counted-rule",
		sourceId: "test",
		regexSource: "(never-matches)",
		caseInsensitive: false,
		secretGroup: 1,
		allowlistRegexSources: [],
	};
	const matcher = new CountingRegExp(definition.regexSource, "dgu");
	const rule: CompiledSecretRule = {
		definition,
		matcher,
		allowlistMatchers: [],
	};

	const result = filterKnownSecretsWithCompiledRules(TEN_MB_OF_PROSE, [rule]);

	expect(result.text).toBe(TEN_MB_OF_PROSE);
	expect(result.counts).toEqual({});
	expect(matcher.executionCount).toBe(1);
});

class CountingRegExp extends RegExp {
	executionCount = 0;

	override exec(text: string): RegExpExecArray | null {
		this.executionCount += 1;
		return super.exec(text);
	}
}
