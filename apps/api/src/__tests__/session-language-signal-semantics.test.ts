import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	LANGUAGE_SIGNAL_RULES,
	SCAN_VERSION,
	scanLanguageSignals,
	scanMemberLanguageSignals,
	scanModelLanguageSignalSegments,
} from "@rudel/language-signals";
import { summarizeSessionLanguageSignals } from "../services/session-language-signal-summary.js";

// Append-only history: semantic changes get a new version and a new entry.
// Never rewrite a fingerprint already assigned to a persisted scan version.
const fingerprintsByVersion: Readonly<Record<number, string>> = {
	1: "6125da80b0cf03ca5fd644bcb6d0c461831c077ff8e4ba1383279dce6715c166",
};

describe("persisted language-signal semantics", () => {
	test("requires a scan-version bump when any persisted scan semantic changes", () => {
		const fingerprint = createHash("sha256")
			.update(JSON.stringify(buildSemanticGoldenCorpusOutput()))
			.digest("hex");
		const knownVersions = Object.keys(fingerprintsByVersion)
			.map(Number)
			.sort((left, right) => left - right);
		const expectedFingerprint = fingerprintsByVersion[SCAN_VERSION];
		assert(expectedFingerprint);

		expect(knownVersions).toEqual(
			Array.from({ length: SCAN_VERSION }, (_, index) => index + 1),
		);
		expect(fingerprint).toBe(expectedFingerprint);
	});
});

function buildSemanticGoldenCorpusOutput() {
	const memberText =
		"Not great. greatish. Great <system_instruction>Sorry fishy fuck</system_instruction> sorry fuck??";
	return {
		boundaryAndNegation: scanLanguageSignals(
			"Not great. greatish. Great fishyish fishy??",
		),
		displaySegments: scanModelLanguageSignalSegments([
			"Sorry `fishy`",
			"did not",
			"work",
			"fuck??",
		]),
		memberPreprocessing: scanMemberLanguageSignals(memberText),
		persistedSummary: summarizeSessionLanguageSignals(
			buildSemanticTranscript(memberText),
		),
		ruleSurfaceOutputs: LANGUAGE_SIGNAL_RULES.flatMap((rule) =>
			rule.surfaces.map((surface) => scanLanguageSignals(surface)),
		),
	};
}

function buildSemanticTranscript(memberText: string) {
	return [
		{
			message: { content: memberText, role: "user" },
			sessionId: "semantic-session",
			timestamp: "2026-08-20T08:00:00.000Z",
			type: "user",
			uuid: "semantic-member",
		},
		{
			isCompactSummary: true,
			message: { content: "Great sorry fuck", role: "user" },
			sessionId: "semantic-session",
			timestamp: "2026-08-20T08:00:01.000Z",
			type: "user",
			uuid: "semantic-hidden-compaction-summary",
		},
		{
			message: {
				content: [{ text: "Sorry `fishy` fuck", type: "text" }],
				role: "assistant",
			},
			sessionId: "semantic-session",
			timestamp: "2026-08-20T08:00:02.000Z",
			type: "assistant",
			uuid: "semantic-model",
		},
	]
		.map((entry) => JSON.stringify(entry))
		.join("\n");
}
