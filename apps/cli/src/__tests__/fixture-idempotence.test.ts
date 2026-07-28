import { expect, test } from "bun:test";
import { filterKnownSecrets, getRedactionCount } from "@rudel/secret-filter";
import {
	containsAnyCanary,
	createClaudeFixtureSecrets,
	createCodexFixtureSecrets,
	readRedactionTemplates,
	renderFixture,
} from "./helpers/cli-e2e.js";

/**
 * CLI-fixture idempotence: filterKnownSecrets must be a fixpoint over the
 * realistic rendered transcripts. The post-filter content-hash dedupe in the
 * API depends on one filter pass and N filter passes producing identical
 * bytes. This variant deliberately lives in apps/cli because the fixtures do —
 * packages/secret-filter must never import CLI test fixtures.
 */

const SESSION_ID = "fixture-idempotence-session";
const templates = await readRedactionTemplates();

const FIXTURE_CASES = [
	{
		name: "realistic Claude session",
		template: templates.claudeSession,
		secrets: createClaudeFixtureSecrets(),
	},
	{
		name: "realistic Claude subagent",
		template: templates.claudeSubagent,
		secrets: createClaudeFixtureSecrets(),
	},
	{
		name: "realistic Codex session",
		template: templates.codexSession,
		secrets: createCodexFixtureSecrets(),
	},
] as const;

test.each(
	FIXTURE_CASES,
)("filterKnownSecrets is a fixpoint over the raw $name fixture", ({
	template,
	secrets,
}) => {
	const raw = renderFixture(template, SESSION_ID, secrets, false);
	const once = filterKnownSecrets(raw);

	// Non-vacuous: the first pass must actually redact the planted canaries.
	expect(getRedactionCount(once.counts)).toBeGreaterThan(0);
	expect(containsAnyCanary(once.text, secrets)).toBe(false);

	// f(f(x)) === f(x): a second pass rewrites nothing.
	const twice = filterKnownSecrets(once.text);
	expect(twice.text).toBe(once.text);
	expect(twice.counts).toEqual({});
	expect(twice.redactedBytes).toBe(0);
});

test.each(
	FIXTURE_CASES,
)("pre-redacted $name fixture passes through byte-identically", ({
	template,
	secrets,
}) => {
	const redacted = renderFixture(template, SESSION_ID, secrets, true);
	expect(redacted).toContain("[REDACTED:");

	const result = filterKnownSecrets(redacted);
	expect(result.text).toBe(redacted);
	expect(result.counts).toEqual({});
	expect(result.redactedBytes).toBe(0);
});
