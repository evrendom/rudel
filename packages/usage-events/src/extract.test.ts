import { describe, expect, test } from "bun:test";
import {
	extractUsageEvents,
	extractUsageEventsAtVersions,
	getUsageAttestationPayload,
	getUsageEventReceiptId,
	getUsageIdentityPrefix,
	USAGE_EVENT_EXTRACTION_VERSION,
	type UsageEvent,
	type UsageExtractionResult,
} from "./index.js";

describe("usage identity versioning", () => {
	test("pins the replay-safe extraction semantics to v2", () => {
		expect(USAGE_EVENT_EXTRACTION_VERSION).toBe(2);
	});

	test("pins every event and lineage prefix to the identity-version knob", () => {
		const kinds = [
			"usage-event",
			"usage-receipt",
			"claude-lineage",
			"codex-lineage",
			"codex-external-lineage",
			"codex-unresolved-lineage",
		] as const;

		expect(kinds.map((kind) => getUsageIdentityPrefix(kind, 1))).toEqual([
			"usage-event:v1",
			"usage-receipt:v1",
			"claude-lineage:v1",
			"codex-lineage:v1",
			"codex-external-lineage:v1",
			"codex-unresolved-lineage:v1",
		]);
		expect(kinds.map((kind) => getUsageIdentityPrefix(kind, 2))).toEqual([
			"usage-event:v2",
			"usage-receipt:v2",
			"claude-lineage:v2",
			"codex-lineage:v2",
			"codex-external-lineage:v2",
			"codex-unresolved-lineage:v2",
		]);
	});

	test("pins the v1 event identity for an authored request", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "stable-message",
					requestId: "stable-request",
					input: 1,
					output: 1,
				}),
			),
		);

		expect(event.eventId).toBe(
			"4420ba38b07e4feb308abb37cb3ae1f0a0a5a0063190efb9d14a2ceb4ddfcf32",
		);
	});

	test("W6 identity changes reach events, receipts, and every emitted lineage", () => {
		const claudeInput = {
			organizationId: "org-1",
			userId: "user-1",
			sessionId: "identity-version-session",
			source: "claude_code" as const,
			content: claudeLine({
				messageId: "identity-version-message",
				requestId: "identity-version-request",
				input: 1,
				output: 1,
			}),
			subagents: {},
		};
		const codexInput = {
			...claudeInput,
			source: "codex" as const,
			content: [
				turnContext("gpt-5.1-codex"),
				codexLine(vector(10, 0, 1, 0), vector(10, 0, 1, 0)),
			].join("\n"),
		};
		const extractIdentities = (
			identityVersion: number,
			extractionVersion: number,
		) =>
			[claudeInput, codexInput].map((input) => {
				const result = complete(
					extractUsageEventsAtVersions(input, {
						extractionVersion,
						identityVersion,
					}),
				);
				return {
					eventId: result.events[0]?.eventId,
					extractionVersion: result.receipt.extractionVersion,
					lineageId: result.events[0]?.lineageId,
				};
			});
		const identityV1 = extractIdentities(1, 1);
		const identityV2 = extractIdentities(2, 1);
		const extractionV2 = extractIdentities(1, 2);

		for (const index of [0, 1]) {
			expect(identityV2[index]?.eventId).not.toBe(identityV1[index]?.eventId);
			expect(identityV2[index]?.lineageId).not.toBe(
				identityV1[index]?.lineageId,
			);
			expect(extractionV2[index]?.eventId).toBe(identityV1[index]?.eventId);
			expect(extractionV2[index]?.lineageId).toBe(identityV1[index]?.lineageId);
			expect(extractionV2[index]?.extractionVersion).toBe(2);
		}
		expect(getUsageEventReceiptId(claudeInput, 2)).not.toBe(
			getUsageEventReceiptId(claudeInput, 1),
		);
	});
});

describe("usage attestation", () => {
	test("checksum ignores extraction-only metadata but covers classes, model, and UTC date", () => {
		const line = claudeLine({
			messageId: "attested-message",
			requestId: "attested-request",
			input: 10,
			output: 2,
		});
		const base = complete(extractClaude(line));
		const duplicate = complete(extractClaude([line, line].join("\n")));
		const shifted = complete(
			extractClaude([JSON.stringify({ type: "user" }), line].join("\n")),
		);

		expect(duplicate.events[0]?.duplicateObservationCount).toBe(1);
		expect(shifted.events[0]?.firstObservedLine).toBe(2);
		expect(duplicate.receipt.checksum).toBe(base.receipt.checksum);
		expect(shifted.receipt.checksum).toBe(base.receipt.checksum);

		const event = onlyEvent(base);
		const payload = getUsageAttestationPayload([event]);
		expect(payload).toEqual([
			[
				"usage-attestation:v1",
				event.eventId,
				"message_id",
				"2026-08-01",
				"claude-sonnet-4-5",
				10,
				10,
				0,
				0,
				0,
				2,
				0,
			],
		]);
		expect(
			getUsageAttestationPayload([{ ...event, outputTokens: 3 }]),
		).not.toEqual(payload);
		expect(
			getUsageAttestationPayload([{ ...event, rawModel: "claude-opus-4-1" }]),
		).not.toEqual(payload);
		expect(
			getUsageAttestationPayload([{ ...event, usageDate: "2026-08-02" }]),
		).not.toEqual(payload);
	});
});

describe("Claude usage-event extraction", () => {
	test("A-01 emits exact request classes, model, date, and context", () => {
		const result = extractClaude(
			claudeLine({
				messageId: "message-1",
				requestId: "request-1",
				input: 100,
				cacheRead: 20,
				cacheFlat: 30,
				cache5m: 10,
				cache1h: 20,
				output: 40,
			}),
		);
		const event = onlyEvent(result);

		expect(event).toMatchObject({
			uncachedInputTokens: 100,
			cacheReadInputTokens: 20,
			cacheWrite5mInputTokens: 10,
			cacheWrite1hInputTokens: 20,
			outputTokens: 40,
			contextInputTokens: 150,
			rawModel: "claude-sonnet-4-5",
			resolvedModel: "claude-sonnet-4-5-20250929",
			usageDate: "2026-08-01",
		});
	});

	test("A-02 counts unique main and subagent requests under their own models", () => {
		const result = extractClaude(
			claudeLine({
				messageId: "main",
				requestId: "main-r",
				input: 10,
				output: 2,
			}),
			{
				worker: claudeLine({
					messageId: "sub",
					requestId: "sub-r",
					input: 20,
					output: 4,
					model: "claude-haiku-4-5",
				}),
			},
		);
		const events = complete(result).events;

		expect(events).toHaveLength(2);
		expect(
			events.map((event) => [event.agentId, event.rawModel]).sort(),
		).toEqual([
			["main", "claude-sonnet-4-5"],
			["worker", "claude-haiku-4-5"],
		]);
		expect(sumEvents(events)).toEqual({ input: 30, output: 6 });
	});

	test("A-03 extracts a nonempty subagent when the main transcript is empty", () => {
		const result = extractClaude("", {
			worker: claudeLine({
				messageId: "sub-only",
				requestId: "sub-only-r",
				input: 21,
				output: 5,
			}),
		});

		expect(onlyEvent(result)).toMatchObject({
			agentId: "worker",
			uncachedInputTokens: 21,
			outputTokens: 5,
		});
	});

	test("A-04 merges an in-main-file sidechain replay and retains the distinct request", () => {
		const unique = claudeLine({
			messageId: "unique-message",
			requestId: "unique-request",
			input: 50,
			output: 5,
		});
		const mainReplay = claudeLine({
			messageId: "replayed-message",
			requestId: "main-request",
			input: 100,
			output: 10,
		});
		const sidechainReplay = claudeLine({
			messageId: "replayed-message",
			requestId: "different-retry-request",
			input: 100,
			output: 10,
			model: "claude-haiku-4-5",
			isSidechain: true,
		});
		const result = extractClaude(
			[unique, mainReplay, sidechainReplay].join("\n"),
		);
		const events = complete(result).events;

		expect(events).toHaveLength(2);
		expect(sumEvents(events)).toEqual({ input: 150, output: 15 });
		expect(
			events.find((event) => event.uncachedInputTokens === 100),
		).toMatchObject({ agentId: "main", rawModel: "claude-sonnet-4-5" });
	});

	test("W6 derives a sidechain-only agent from the embedded agent ID", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					agentId: "worker-1",
					isSidechain: true,
					messageId: "sidechain-only",
					requestId: "sidechain-only-request",
					input: 10,
					output: 2,
				}),
			),
		);

		expect(event.agentId).toBe("worker-1");
	});

	test("W6 sidechain and subagent duplicates retain their shared real agent ID", () => {
		const sidechain = claudeLine({
			agentId: "worker-1",
			isSidechain: true,
			messageId: "sidechain-pair",
			requestId: "sidechain-main-request",
			input: 10,
			output: 2,
		});
		const subagent = claudeLine({
			messageId: "sidechain-pair",
			requestId: "sidechain-subagent-request",
			input: 10,
			output: 2,
		});
		const event = onlyEvent(extractClaude(sidechain, { "worker-1": subagent }));

		expect(event.agentId).toBe("worker-1");
		expect(event.qualityFlags).not.toContain("agent_identity_conflict");
	});

	test("A-05 later zero shadow cannot erase an earlier 42/7 record", () => {
		const first = claudeLine({
			messageId: "shadowed",
			requestId: "first",
			input: 42,
			output: 7,
		});
		const shadow = claudeLine({
			messageId: "shadowed",
			requestId: "later",
			input: 0,
			output: 0,
			timestamp: "2026-08-01T11:00:00.000Z",
		});

		expect(onlyEvent(extractClaude([first, shadow].join("\n")))).toMatchObject({
			uncachedInputTokens: 42,
			outputTokens: 7,
		});
	});

	test("A-06 per-field maxima retain complementary valid fields", () => {
		const inputCopy = claudeLine({
			messageId: "partial",
			requestId: "one",
			input: 42,
			output: 0,
		});
		const outputCopy = claudeLine({
			messageId: "partial",
			requestId: "two",
			input: 0,
			output: 7,
		});

		expect(
			onlyEvent(extractClaude([inputCopy, outputCopy].join("\n"))),
		).toMatchObject({ uncachedInputTokens: 42, outputTokens: 7 });
	});

	test("A-07 main metadata wins a main/subagent model conflict", () => {
		const main = claudeLine({
			messageId: "shared",
			requestId: "main",
			input: 10,
			output: 2,
			model: "claude-opus-4-1",
		});
		const subagent = claudeLine({
			messageId: "shared",
			requestId: "sub",
			input: 10,
			output: 2,
			model: "claude-haiku-4-5",
		});

		expect(onlyEvent(extractClaude(main, { worker: subagent }))).toMatchObject({
			agentId: "main",
			rawModel: "claude-opus-4-1",
			modelStatus: "resolved",
		});
	});

	test("Claude model copies differing only by case do not create a conflict", () => {
		const lower = claudeLine({
			messageId: "case-model",
			requestId: "case-lower",
			input: 10,
			output: 2,
			model: "claude-sonnet-4-5",
		});
		const upper = claudeLine({
			messageId: "case-model",
			requestId: "case-upper",
			input: 10,
			output: 2,
			model: "CLAUDE-SONNET-4-5",
		});

		expect(onlyEvent(extractClaude([lower, upper].join("\n")))).toMatchObject({
			rawModel: "claude-sonnet-4-5",
			modelStatus: "resolved",
		});
	});

	test("A-08 a synthetic main model falls back to one agreeing real copy", () => {
		const main = claudeLine({
			messageId: "shared",
			requestId: "main",
			input: 10,
			output: 2,
			model: "<synthetic>",
		});
		const subagent = claudeLine({
			messageId: "shared",
			requestId: "sub",
			input: 10,
			output: 2,
			model: "claude-haiku-4-5",
		});

		expect(onlyEvent(extractClaude(main, { worker: subagent }))).toMatchObject({
			rawModel: "claude-haiku-4-5",
			modelStatus: "resolved",
		});
	});

	test("A-09 preserves nested one-hour cache writes when 1h exceeds flat", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "cache-a",
					requestId: "cache-a-r",
					input: 1,
					output: 1,
					cacheFlat: 5,
					cache5m: 2,
					cache1h: 10,
				}),
			),
		);

		expect(event).toMatchObject({
			cacheWrite5mInputTokens: 2,
			cacheWrite1hInputTokens: 10,
			contextInputTokens: 13,
		});
		expect(event.qualityFlags).toContain("cache_write_flat_nested_mismatch");
	});

	test("A-10 preserves one-hour writes when flat is zero", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "cache-b",
					requestId: "cache-b-r",
					input: 1,
					output: 1,
					cacheFlat: 0,
					cache1h: 9,
				}),
			),
		);

		expect(event.cacheWrite1hInputTokens).toBe(9);
		expect(event.qualityFlags).toContain("cache_write_flat_nested_mismatch");
	});

	test("A-11 assigns flat cache excess to five-minute writes", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "cache-c",
					requestId: "cache-c-r",
					input: 1,
					output: 1,
					cacheFlat: 20,
					cache5m: 3,
					cache1h: 5,
				}),
			),
		);

		expect(event).toMatchObject({
			cacheWrite5mInputTokens: 15,
			cacheWrite1hInputTokens: 5,
		});
		expect(event.qualityFlags).toContain("cache_write_flat_nested_mismatch");
	});

	test("a flat-only cache write does not claim a nested mismatch", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "flat-only-cache",
					requestId: "flat-only-cache-request",
					input: 1,
					output: 1,
					cacheFlat: 20,
					omitCacheCreation: true,
				}),
			),
		);

		expect(event.cacheWrite5mInputTokens).toBe(20);
		expect(event.qualityFlags).not.toContain(
			"cache_write_flat_nested_mismatch",
		);
	});

	test("A-12 subagent map order does not change event output or checksum", () => {
		const alpha = claudeLine({
			messageId: "alpha",
			requestId: "alpha-r",
			input: 3,
			output: 1,
		});
		const beta = claudeLine({
			messageId: "beta",
			requestId: "beta-r",
			input: 4,
			output: 2,
		});
		const first = complete(extractClaude("", { alpha, beta }));
		const second = complete(extractClaude("", { beta, alpha }));

		expect(first.events).toEqual(second.events);
		expect(first.receipt.checksum).toBe(second.receipt.checksum);
	});

	test("A-13 user-only transcript yields an authored zero-event receipt", () => {
		const result = complete(
			extractClaude(
				JSON.stringify({
					type: "user",
					timestamp: "2026-08-01T10:00:00.000Z",
				}),
			),
		);

		expect(result.events).toEqual([]);
		expect(result.receipt.eventCount).toBe(0);
		expect(result.receipt.modelRateCardVersion).toBe("2026-08-02");
		expect(result.receipt.checksum).toBe(
			"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
		);
	});

	test("A-14 byte-identical keyless records collapse with a diagnostic", () => {
		const keyless = claudeLine({
			messageId: "",
			requestId: "",
			uuid: "",
			input: 12,
			output: 3,
		});
		const result = complete(extractClaude([keyless, keyless].join("\n")));
		const event = result.events[0];

		expect(result.events).toHaveLength(1);
		expect(event?.duplicateObservationCount).toBe(1);
		expect(event?.qualityFlags).toContain("keyless_exact_duplicate");
	});

	test("X-05 retains tokens but leaves invalid timestamp usage unpriceable", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "bad-time",
					requestId: "bad-time-r",
					input: 8,
					output: 2,
					timestamp: "not-a-time",
				}),
			),
		);

		expect(event).toMatchObject({
			uncachedInputTokens: 8,
			occurredAt: null,
			usageDate: null,
			resolvedModel: "",
			modelStatus: "unresolved",
		});
	});

	test("timestamp parsing is timezone-invariant and rejects partial or timezone-free input", () => {
		const previousTimezone = process.env.TZ;
		const validChecksums: string[] = [];
		try {
			for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
				process.env.TZ = timezone;
				validChecksums.push(
					complete(
						extractClaude(
							claudeLine({
								messageId: "valid-zoned-time",
								requestId: "valid-zoned-time-request",
								input: 8,
								output: 2,
								timestamp: "2026-08-01T12:30:00+02:30",
							}),
						),
					).receipt.checksum,
				);
				for (const timestamp of ["2026", "2026-08-01T10:00:00"]) {
					const event = onlyEvent(
						extractClaude(
							claudeLine({
								messageId: `invalid-${timezone}-${timestamp}`,
								requestId: "invalid-time-request",
								input: 8,
								output: 2,
								timestamp,
							}),
						),
					);
					expect(event.occurredAt).toBeNull();
					expect(event.usageDate).toBeNull();
				}
			}
		} finally {
			if (previousTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = previousTimezone;
			}
		}
		expect(new Set(validChecksums).size).toBe(1);

		const offsetEvent = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "offset-time",
					requestId: "offset-time-request",
					input: 8,
					output: 2,
					timestamp: "2026-08-01T12:30:00+02:30",
				}),
			),
		);
		expect(offsetEvent.occurredAt).toBe("2026-08-01T10:00:00.000Z");
		expect(offsetEvent.usageDate).toBe("2026-08-01");
	});

	test("A-15 valid subagent metadata fills an invalid main timestamp", () => {
		const main = claudeLine({
			messageId: "metadata-fallback",
			requestId: "main-request",
			input: 10,
			output: 2,
			timestamp: "invalid",
		});
		const subagent = claudeLine({
			messageId: "metadata-fallback",
			requestId: "sub-request",
			input: 10,
			output: 2,
			timestamp: "2026-08-02T11:30:00.000Z",
		});

		expect(onlyEvent(extractClaude(main, { worker: subagent }))).toMatchObject({
			occurredAt: "2026-08-02T11:30:00.000Z",
			usageDate: "2026-08-02",
		});
	});

	test("A-16 an unknown rate-card model retains tokens but stays unresolved", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "unknown-model",
					requestId: "unknown-model-request",
					input: 19,
					output: 3,
					model: "claude-future-unknown",
				}),
			),
		);

		expect(event).toMatchObject({
			rawModel: "claude-future-unknown",
			resolvedModel: "",
			modelStatus: "unresolved",
			uncachedInputTokens: 19,
		});
	});

	test("normalizes allowlisted tiers and quarantines unknown tier cardinality", () => {
		const normalized = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "tier-standard",
					requestId: "tier-standard-request",
					input: 1,
					output: 1,
					serviceTier: " STANDARD ",
				}),
			),
		);
		const unknownResult = complete(
			extractClaude(
				claudeLine({
					messageId: "tier-future",
					requestId: "tier-future-request",
					input: 1,
					output: 1,
					serviceTier: "tenant-specific-future-tier",
				}),
			),
		);

		expect(normalized.serviceTier).toBe("standard");
		expect(onlyEvent(unknownResult)).toMatchObject({
			serviceTier: "",
			qualityFlags: expect.arrayContaining(["unrecognized_service_tier"]),
		});
		expect(unknownResult.diagnostics).toContainEqual({
			code: "claude_code_unrecognized_service_tier",
			count: 1,
			details: ["tenant-specific-future-tier"],
			fatal: false,
		});
	});

	test("W4 caps attacker-influenced diagnostic detail cardinality and size", () => {
		const content = Array.from({ length: 10_000 }, (_, index) =>
			claudeLine({
				messageId: `tier-cap-${index}`,
				requestId: `tier-cap-request-${index}`,
				input: 1,
				output: 1,
				serviceTier: `tenant-${index}-${"x".repeat(512)}`,
			}),
		).join("\n");
		const result = complete(extractClaude(content));
		const diagnostic = result.diagnostics.find(
			(item) => item.code === "claude_code_unrecognized_service_tier",
		);

		expect(diagnostic?.count).toBe(10_000);
		expect(diagnostic?.details).toHaveLength(21);
		expect(diagnostic?.details).toContain("<additional-details-omitted>");
		expect(
			Math.max(...(diagnostic?.details ?? []).map((detail) => detail.length)),
		).toBeLessThanOrEqual(256);
		expect(Buffer.byteLength(JSON.stringify(result.diagnostics))).toBeLessThan(
			8_192,
		);
	});

	test("flags a literal subagent ID named main as attribution-ambiguous", () => {
		const event = onlyEvent(
			extractClaude("", {
				main: claudeLine({
					messageId: "colliding-agent",
					requestId: "colliding-agent-request",
					input: 1,
					output: 1,
				}),
			}),
		);

		expect(event.agentId).toBe("main");
		expect(event.qualityFlags).toContain("subagent_id_collides_with_main");
	});

	test("non-object, malformed non-usage, and nonbillable partial lines stay diagnostic-only", () => {
		const valid = claudeLine({
			messageId: "valid-after-anomaly",
			requestId: "valid-after-anomaly-request",
			input: 9,
			output: 2,
		});
		const partial = JSON.stringify({
			type: "assistant",
			message: { usage: { input_tokens: 0 } },
		});
		const result = complete(
			extractClaude(["[]", "{truncated metadata", partial, valid].join("\n")),
		);

		expect(result.events).toHaveLength(1);
		expect(result.receipt.complete).toBe(true);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				{ code: "non_object_json_line", count: 1, fatal: false },
				{ code: "malformed_json_line", count: 1, fatal: false },
				{
					code: "claude_nonbillable_partial_usage",
					count: 1,
					fatal: false,
				},
			]),
		);
	});

	test("C-09 zero half emits a provider-authored zero event with a quality flag", () => {
		const result = complete(
			extractClaude(
				claudeLine({
					messageId: "provider-zero",
					requestId: "provider-zero-request",
					input: 0,
					output: 0,
				}),
			),
		);
		const event = onlyEvent(result);

		expect(event).toMatchObject({
			uncachedInputTokens: 0,
			cacheReadInputTokens: 0,
			cacheWrite5mInputTokens: 0,
			cacheWrite1hInputTokens: 0,
			outputTokens: 0,
		});
		expect(event.qualityFlags).toContain("zero_usage_event");
		expect(result.diagnostics).toContainEqual({
			code: "claude_zero_usage_event",
			count: 1,
			fatal: false,
		});
	});

	test("a model from the wrong provider remains explicitly unpriced", () => {
		const event = onlyEvent(
			extractClaude(
				claudeLine({
					messageId: "wrong-provider-model",
					requestId: "wrong-provider-model-request",
					input: 7,
					output: 1,
					model: "gpt-5.1-codex",
				}),
			),
		);

		expect(event).toMatchObject({
			rawModel: "gpt-5.1-codex",
			resolvedModel: "",
			modelStatus: "unresolved",
			uncachedInputTokens: 7,
		});
		expect(event.qualityFlags).toContain("provider_model_mismatch");
	});
});

describe("Codex usage-event extraction", () => {
	test("C-01 ordinary unique increments sum to the final snapshot", () => {
		const result = extractCodex([
			turnContext("gpt-5.1-codex"),
			codexLine(vector(100, 40, 10, 2), vector(100, 40, 10, 2)),
			codexLine(vector(160, 50, 20, 4), vector(60, 10, 10, 2)),
		]);
		const events = complete(result).events;

		expect(events).toHaveLength(2);
		expect(sumTokenClasses(events)).toEqual({
			uncached: 110,
			cacheRead: 50,
			output: 20,
			reasoning: 4,
		});
		expect(
			events
				.map((event) => event.contextInputTokens)
				.sort((left, right) => left - right),
		).toEqual([60, 100]);
		expect(
			events.map((event) => ({
				rawModel: event.rawModel,
				resolvedModel: event.resolvedModel,
				usageDate: event.usageDate,
			})),
		).toEqual([
			{
				rawModel: "gpt-5.1-codex",
				resolvedModel: "gpt-5.1-codex",
				usageDate: "2026-08-01",
			},
			{
				rawModel: "gpt-5.1-codex",
				resolvedModel: "gpt-5.1-codex",
				usageDate: "2026-08-01",
			},
		]);
		expect(result.diagnostics).not.toContainEqual(
			expect.objectContaining({ code: "codex_single_lineage_final_mismatch" }),
		);
	});

	test("C-02 repeated transition telemetry emits one event", () => {
		const line = codexLine(vector(100, 20, 10, 2), vector(100, 20, 10, 2));
		const result = complete(
			extractCodex([turnContext("gpt-5.1-codex"), line, line]),
		);
		const event = result.events[0];

		expect(result.events).toHaveLength(1);
		expect(event?.duplicateObservationCount).toBe(1);
		expect(event?.qualityFlags).toContain(
			"indistinguishable_transition_collision",
		);
	});

	test("C-18 suppresses a forked session's dense inherited replay prefix", () => {
		const result = complete(
			extractCodex([
				codexSessionMeta({ forkedFromId: "parent-session" }),
				turnContext("gpt-5.6-sol"),
				codexLine(
					vector(100, 80, 10, 2),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.000Z",
				),
				codexLine(
					vector(200, 160, 20, 4),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.020Z",
				),
				codexLine(
					vector(250, 200, 25, 5),
					vector(50, 40, 5, 1),
					"2026-08-01T10:00:02.000Z",
				),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(result.events[0]).toMatchObject({
			cacheReadInputTokens: 40,
			contextInputTokens: 50,
			outputTokens: 5,
			uncachedInputTokens: 10,
		});
		expect(result.events[0]?.qualityFlags).toContain(
			"inherited_external_baseline_unverified",
		);
		expect(result.diagnostics).toContainEqual({
			code: "codex_replayed_parent_prefix_suppressed",
			count: 2,
			fatal: false,
		});
	});

	test("C-19 recognizes nested thread-spawn parent metadata", () => {
		const result = complete(
			extractCodex([
				codexSessionMeta({ threadSpawnParentId: "parent-session" }),
				turnContext("gpt-5.6-sol"),
				codexLine(
					vector(100, 80, 10, 2),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.000Z",
				),
				codexLine(
					vector(200, 160, 20, 4),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.020Z",
				),
				codexLine(
					vector(250, 200, 25, 5),
					vector(50, 40, 5, 1),
					"2026-08-01T10:00:02.000Z",
				),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(sumTokenClasses(result.events)).toEqual({
			cacheRead: 40,
			output: 5,
			reasoning: 1,
			uncached: 10,
		});
	});

	test("C-20 never suppresses dense requests without explicit parent metadata", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.6-sol"),
				codexLine(
					vector(100, 80, 10, 2),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.000Z",
				),
				codexLine(
					vector(200, 160, 20, 4),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.020Z",
				),
			]),
		);

		expect(result.events).toHaveLength(2);
		expect(result.diagnostics).not.toContainEqual(
			expect.objectContaining({
				code: "codex_replayed_parent_prefix_suppressed",
			}),
		);
	});

	test("C-21 never suppresses a fork whose first requests are not a dense burst", () => {
		const result = complete(
			extractCodex([
				codexSessionMeta({ forkedFromId: "parent-session" }),
				turnContext("gpt-5.6-sol"),
				codexLine(
					vector(100, 80, 10, 2),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.000Z",
				),
				codexLine(
					vector(200, 160, 20, 4),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:02.000Z",
				),
			]),
		);

		expect(result.events).toHaveLength(2);
		expect(result.diagnostics).not.toContainEqual(
			expect.objectContaining({
				code: "codex_replayed_parent_prefix_suppressed",
			}),
		);
	});

	test("C-22 repeated telemetry inside replay is suppressed once", () => {
		const first = codexLine(
			vector(100, 80, 10, 2),
			vector(100, 80, 10, 2),
			"2026-08-01T10:00:00.000Z",
		);
		const result = complete(
			extractCodex([
				codexSessionMeta({ forkedFromId: "parent-session" }),
				turnContext("gpt-5.6-sol"),
				first,
				first,
				codexLine(
					vector(200, 160, 20, 4),
					vector(100, 80, 10, 2),
					"2026-08-01T10:00:00.020Z",
				),
				codexLine(
					vector(250, 200, 25, 5),
					vector(50, 40, 5, 1),
					"2026-08-01T10:00:02.000Z",
				),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(result.diagnostics).toContainEqual({
			code: "codex_replayed_parent_prefix_suppressed",
			count: 2,
			fatal: false,
		});
	});

	test("C-23 context input follows each request, not the cumulative session total", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.6-sol"),
				codexLine(
					vector(300_000, 250_000, 10, 2),
					vector(100_000, 80_000, 10, 2),
				),
				codexLine(
					vector(572_000, 500_000, 20, 4),
					vector(272_000, 250_000, 10, 2),
				),
				codexLine(
					vector(844_001, 750_000, 30, 6),
					vector(272_001, 250_000, 10, 2),
				),
			]),
		);

		expect(
			result.events
				.map((event) => event.contextInputTokens)
				.sort((left, right) => left - right),
		).toEqual([100_000, 272_000, 272_001]);
	});

	test("C-03 missing-last exact total emits no delta", () => {
		const total = vector(100, 20, 10, 2);
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(total, total),
				codexLine(total, undefined),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(result.diagnostics).toContainEqual({
			code: "codex_missing_last_exact_repeat",
			count: 1,
			fatal: false,
		});
	});

	test("a nonbillable partial last-usage object is diagnostic-only", () => {
		const total = vector(100, 20, 10, 2);
		const first = codexLine(total, total);
		const partial = JSON.stringify({
			timestamp: "2026-08-01T10:01:00.000Z",
			type: "event_msg",
			payload: {
				type: "token_count",
				info: {
					total_token_usage: {
						input_tokens: 100,
						cached_input_tokens: 20,
						output_tokens: 10,
						reasoning_output_tokens: 2,
					},
					last_token_usage: {},
				},
			},
		});
		const result = complete(
			extractCodex([turnContext("gpt-5"), first, partial]),
		);

		expect(result.events).toHaveLength(1);
		expect(result.diagnostics).toContainEqual({
			code: "codex_nonbillable_partial_last_usage",
			count: 1,
			fatal: false,
		});
	});

	test("W2 null optional reasoning tokens stay record-local", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLineWithReasoning(vector(100, 20, 10, 0), null, null),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(result.events[0]?.reasoningOutputTokens).toBe(0);
		expect(result.diagnostics).toContainEqual({
			code: "codex_invalid_optional_reasoning_output_tokens",
			count: 2,
			fatal: false,
		});
	});

	test("W2 negative optional reasoning tokens stay record-local", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLineWithReasoning(vector(100, 20, 10, 0), -2, -1),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(result.events[0]?.reasoningOutputTokens).toBe(0);
		expect(result.diagnostics).toContainEqual({
			code: "codex_invalid_optional_reasoning_output_tokens",
			count: 2,
			fatal: false,
		});
	});

	test("V6 a zero-vector last increment is a no-op, never a fallback charge", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(vector(100, 20, 10, 2), vector(100, 20, 10, 2)),
				codexLine(vector(150, 30, 15, 3), vector(0, 0, 0, 0)),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(sumTokenClasses(result.events)).toEqual({
			uncached: 80,
			cacheRead: 20,
			output: 10,
			reasoning: 2,
		});
		expect(result.events[0]?.tokenSource).toBe("provider_increment");
		expect(result.diagnostics).toContainEqual({
			code: "codex_zero_last_increment",
			count: 1,
			fatal: false,
		});
		expect(result.diagnostics).not.toContainEqual(
			expect.objectContaining({ code: "codex_cumulative_delta_fallback" }),
		);
	});

	test("W1 a zero increment does not launder a later resume prefix", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(vector(900, 0, 90, 0), vector(0, 0, 0, 0)),
				codexLine(vector(1_000, 0, 100, 0), vector(100, 0, 10, 0)),
			]),
		);
		const event = result.events[0];

		expect(result.events).toHaveLength(1);
		expect(event).toMatchObject({
			parentLineageId: "",
			uncachedInputTokens: 100,
			outputTokens: 10,
		});
		expect(event?.qualityFlags).toContain(
			"inherited_external_baseline_unverified",
		);
		expect(result.diagnostics).toContainEqual({
			code: "codex_inherited_external_baseline",
			count: 1,
			fatal: false,
		});
	});

	test("W1 a zero increment repeating a reached total preserves its real lineage", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0)),
				codexLine(vector(100, 0, 10, 0), vector(0, 0, 0, 0)),
				codexLine(vector(150, 0, 15, 0), vector(50, 0, 5, 0)),
			]),
		);
		const first = result.events.find(
			(event) => event.contextInputTokens === 100,
		);
		const second = result.events.find(
			(event) => event.contextInputTokens === 50,
		);

		expect(result.events).toHaveLength(2);
		expect(second?.parentLineageId).toBe(first?.lineageId);
		expect(second?.qualityFlags).not.toContain(
			"inherited_external_baseline_unverified",
		);
		expect(result.diagnostics).not.toContainEqual(
			expect.objectContaining({ code: "codex_inherited_external_baseline" }),
		);
	});

	test("C-04 advancing missing-last total uses the unique compatible delta", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(vector(100, 20, 10, 2), vector(100, 20, 10, 2)),
				codexLine(vector(150, 30, 15, 3), undefined),
			]),
		);
		const fallback = result.events.find(
			(event) => event.tokenSource === "cumulative_delta_fallback",
		);

		expect(fallback).toMatchObject({
			contextInputTokens: 50,
			uncachedInputTokens: 40,
			cacheReadInputTokens: 10,
			outputTokens: 5,
			reasoningOutputTokens: 1,
		});
	});

	test("C-05 resume prefix emits only the authored 100/10 increment", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(vector(1_000, 0, 100, 0), vector(100, 0, 10, 0)),
			]),
		);
		const event = result.events[0];

		expect(result.events).toHaveLength(1);
		expect(event).toMatchObject({
			uncachedInputTokens: 100,
			outputTokens: 10,
			contextInputTokens: 100,
		});
		expect(event?.qualityFlags).toContain(
			"inherited_external_baseline_unverified",
		);
	});

	test("C-06 interleaved baselines emit 240/24, never segment 340/34", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5"),
				codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0)),
				codexLine(vector(200, 0, 20, 0), vector(100, 0, 10, 0)),
				codexLine(vector(140, 0, 14, 0), vector(40, 0, 4, 0)),
			]),
		);

		expect(result.events).toHaveLength(3);
		expect(sumTokenClasses(result.events)).toEqual({
			uncached: 240,
			cacheRead: 0,
			output: 24,
			reasoning: 0,
		});
		expect(
			result.events.every((event) =>
				event.qualityFlags.includes("interleaved_model_attribution_unverified"),
			),
		).toBe(true);
	});

	test("C-07 a cumulative decrease alone never opens a billable segment", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5"),
				codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0)),
				codexLine(vector(40, 0, 4, 0), undefined),
			]),
		);

		expect(result.events).toHaveLength(1);
		expect(sumTokenClasses(result.events).uncached).toBe(100);
	});

	test("C-08 each transition retains line-local models and conflicts fail closed", () => {
		const firstTransition = codexLine(
			vector(100, 0, 10, 0),
			vector(100, 0, 10, 0),
		);
		const result = complete(
			extractCodex([
				turnContext("gpt-5"),
				firstTransition,
				turnContext("gpt-5.1-codex"),
				firstTransition,
				codexLine(vector(150, 0, 15, 0), vector(50, 0, 5, 0)),
			]),
		);

		expect(result.events).toHaveLength(2);
		expect(
			result.events.find((event) => event.contextInputTokens === 100),
		).toMatchObject({
			rawModel: "",
			resolvedModel: "",
			modelStatus: "conflict",
		});
		expect(
			result.events.find((event) => event.contextInputTokens === 50),
		).toMatchObject({
			rawModel: "gpt-5.1-codex",
			resolvedModel: "gpt-5.1-codex",
			modelStatus: "resolved",
		});
		expect(result.diagnostics).toContainEqual({
			code: "codex_transition_model_conflict",
			count: 1,
			fatal: false,
		});
	});

	test("C-17 usage-bearing malformed JSON makes extraction incomplete", () => {
		const result = extractCodex([
			turnContext("gpt-5"),
			'{"type":"event_msg","payload":{"type":"token_count",',
			codexLine(vector(10, 0, 1, 0), vector(10, 0, 1, 0)),
		]);

		expect(result.status).toBe("incomplete");
		expect(result.events).toEqual([]);
		expect(result.receipt.complete).toBe(false);
		expect(result.receipt.eventCount).toBe(0);
		expect(result.diagnostics).toContainEqual({
			code: "malformed_json_line",
			count: 1,
			fatal: true,
		});
	});

	test("C-10 cached input and reasoning remain subsets, not added twice", () => {
		const event = onlyEvent(
			extractCodex([
				turnContext("gpt-5"),
				codexLine(vector(100, 60, 20, 8), vector(100, 60, 20, 8)),
			]),
		);

		expect(event).toMatchObject({
			uncachedInputTokens: 40,
			cacheReadInputTokens: 60,
			outputTokens: 20,
			reasoningOutputTokens: 8,
		});
	});

	test("Codex tiers are normalized before LowCardinality persistence", () => {
		const allowed = onlyEvent(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(
					vector(10, 0, 1, 0),
					vector(10, 0, 1, 0),
					"2026-08-01T10:00:00.000Z",
					" PRIORITY ",
				),
			]),
		);
		const unknown = onlyEvent(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(
					vector(10, 0, 1, 0),
					vector(10, 0, 1, 0),
					"2026-08-01T10:00:00.000Z",
					"tenant-specific-future-tier",
				),
			]),
		);

		expect(allowed.serviceTier).toBe("priority");
		expect(unknown).toMatchObject({
			serviceTier: "",
			qualityFlags: expect.arrayContaining(["unrecognized_service_tier"]),
		});
	});

	test("C-11 user-only transcript yields zero events", () => {
		const result = complete(
			extractCodex([
				JSON.stringify({
					timestamp: "2026-08-01T10:00:00.000Z",
					type: "event_msg",
					payload: { type: "user_message" },
				}),
			]),
		);

		expect(result.events).toEqual([]);
		expect(result.receipt.eventCount).toBe(0);
	});

	test("C-12 indistinguishable parallel transitions count once and disclose residual", () => {
		const first = codexLine(
			vector(100, 0, 10, 0),
			vector(100, 0, 10, 0),
			"2026-08-01T10:00:00.000Z",
		);
		const second = codexLine(
			vector(100, 0, 10, 0),
			vector(100, 0, 10, 0),
			"2026-08-01T10:01:00.000Z",
		);
		const result = complete(
			extractCodex([turnContext("gpt-5"), first, second]),
		);
		const event = onlyEvent(result);

		expect(event.uncachedInputTokens).toBe(100);
		expect(event.duplicateObservationCount).toBe(1);
		expect(event.qualityFlags).toContain(
			"indistinguishable_transition_collision",
		);
		expect(result.diagnostics).toContainEqual({
			code: "codex_duplicate_transition",
			count: 1,
			details: ["line=3;model=gpt-5"],
			fatal: false,
		});
	});

	test("W4 duplicate-transition diagnostics share the global detail cap", () => {
		const transition = codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0));
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				...Array(30).fill(transition),
			]),
		);
		const diagnostic = result.diagnostics.find(
			(item) => item.code === "codex_duplicate_transition",
		);

		expect(diagnostic?.count).toBe(29);
		expect(diagnostic?.details).toHaveLength(21);
		expect(diagnostic?.details).toContain("<additional-details-omitted>");
	});

	test("C-13 interleaved different-model line contexts remain anchor-flagged", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5"),
				codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0)),
				turnContext("gpt-5.1-codex"),
				codexLine(vector(200, 0, 20, 0), vector(100, 0, 10, 0)),
				turnContext("gpt-5"),
				codexLine(vector(140, 0, 14, 0), vector(40, 0, 4, 0)),
			]),
		);

		expect(
			result.events.every((event) =>
				event.qualityFlags.includes("interleaved_model_attribution_unverified"),
			),
		).toBe(true);
	});

	test("C-14 duplicate telemetry can supply a previously missing model", () => {
		const transition = codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0));
		const event = onlyEvent(
			extractCodex([transition, turnContext("gpt-5.1-codex"), transition]),
		);

		expect(event).toMatchObject({
			rawModel: "gpt-5.1-codex",
			resolvedModel: "gpt-5.1-codex",
			modelStatus: "resolved",
		});
	});

	test("C-15 distinct transitions from one baseline are marked multi-lineage", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5"),
				codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0)),
				codexLine(vector(50, 0, 5, 0), vector(50, 0, 5, 0)),
				codexLine(vector(25, 0, 3, 0), vector(25, 0, 3, 0)),
			]),
		);

		expect(result.diagnostics).toContainEqual({
			code: "codex_multiple_lineages",
			count: 2,
			fatal: false,
		});
		expect(
			result.events.every((event) =>
				event.qualityFlags.includes("interleaved_model_attribution_unverified"),
			),
		).toBe(true);
	});

	test("C-16 missing-last telemetry with multiple compatible baselines stays unbilled", () => {
		const result = complete(
			extractCodex([
				turnContext("gpt-5.1-codex"),
				codexLine(vector(100, 0, 10, 0), vector(100, 0, 10, 0)),
				codexLine(vector(150, 0, 15, 0), vector(50, 0, 5, 0)),
				codexLine(vector(200, 0, 20, 0), undefined),
			]),
		);

		expect(result.events).toHaveLength(2);
		expect(result.diagnostics).toContainEqual({
			code: "codex_unresolved_missing_last",
			count: 1,
			fatal: false,
		});
	});
});

function extractClaude(
	content: string,
	subagents: Readonly<Record<string, string>> = {},
): UsageExtractionResult {
	return extractUsageEvents({
		organizationId: "org-1",
		userId: "user-1",
		sessionId: "session-1",
		source: "claude_code",
		content,
		subagents,
	});
}

function extractCodex(lines: readonly string[]): UsageExtractionResult {
	return extractUsageEvents({
		organizationId: "org-1",
		userId: "user-1",
		sessionId: "session-1",
		source: "codex",
		content: lines.join("\n"),
		subagents: {},
	});
}

function complete(result: UsageExtractionResult) {
	if (result.status !== "complete") {
		throw new Error(
			`Expected complete extraction: ${JSON.stringify(result.diagnostics)}`,
		);
	}
	return result;
}

function onlyEvent(result: UsageExtractionResult): UsageEvent {
	const events = complete(result).events;
	expect(events).toHaveLength(1);
	const event = events[0];
	if (!event) throw new Error("Expected one usage event");
	return event;
}

function sumEvents(events: readonly UsageEvent[]) {
	return events.reduce(
		(total, event) => ({
			input: total.input + event.uncachedInputTokens,
			output: total.output + event.outputTokens,
		}),
		{ input: 0, output: 0 },
	);
}

function sumTokenClasses(events: readonly UsageEvent[]) {
	return events.reduce(
		(total, event) => ({
			uncached: total.uncached + event.uncachedInputTokens,
			cacheRead: total.cacheRead + event.cacheReadInputTokens,
			output: total.output + event.outputTokens,
			reasoning: total.reasoning + event.reasoningOutputTokens,
		}),
		{ uncached: 0, cacheRead: 0, output: 0, reasoning: 0 },
	);
}

function claudeLine(input: {
	agentId?: string;
	messageId: string;
	requestId: string;
	input: number;
	output: number;
	uuid?: string;
	cacheRead?: number;
	cacheFlat?: number;
	cache5m?: number;
	cache1h?: number;
	model?: string;
	omitCacheCreation?: boolean;
	serviceTier?: string;
	timestamp?: string;
	isSidechain?: boolean;
}): string {
	return JSON.stringify({
		...(input.agentId === undefined ? {} : { agentId: input.agentId }),
		type: "assistant",
		timestamp: input.timestamp ?? "2026-08-01T10:00:00.000Z",
		requestId: input.requestId,
		isSidechain: input.isSidechain ?? false,
		uuid: input.uuid ?? `uuid-${input.messageId}`,
		message: {
			id: input.messageId,
			model: input.model ?? "claude-sonnet-4-5",
			usage: {
				input_tokens: input.input,
				cache_read_input_tokens: input.cacheRead ?? 0,
				cache_creation_input_tokens: input.cacheFlat ?? 0,
				...(input.omitCacheCreation
					? {}
					: {
							cache_creation: {
								ephemeral_5m_input_tokens: input.cache5m ?? 0,
								ephemeral_1h_input_tokens: input.cache1h ?? 0,
							},
						}),
				output_tokens: input.output,
				service_tier: input.serviceTier ?? "standard",
			},
		},
	});
}

interface TestCodexVector {
	input: number;
	cacheRead: number;
	output: number;
	reasoning: number;
}

function vector(
	input: number,
	cacheRead: number,
	output: number,
	reasoning: number,
): TestCodexVector {
	return { input, cacheRead, output, reasoning };
}

function codexSessionMeta(input: {
	forkedFromId?: string;
	threadSpawnParentId?: string;
}): string {
	return JSON.stringify({
		timestamp: "2026-08-01T10:00:00.000Z",
		type: "session_meta",
		payload: {
			id: "session-1",
			...(input.forkedFromId === undefined
				? {}
				: { forked_from_id: input.forkedFromId }),
			...(input.threadSpawnParentId === undefined
				? {}
				: {
						source: {
							subagent: {
								thread_spawn: {
									parent_thread_id: input.threadSpawnParentId,
								},
							},
						},
					}),
		},
	});
}

function turnContext(model: string): string {
	return JSON.stringify({
		timestamp: "2026-08-01T09:59:00.000Z",
		type: "turn_context",
		payload: { model },
	});
}

function codexLine(
	total: TestCodexVector,
	last: TestCodexVector | undefined,
	timestamp = "2026-08-01T10:00:00.000Z",
	serviceTier?: string,
): string {
	return JSON.stringify({
		timestamp,
		type: "event_msg",
		payload: {
			type: "token_count",
			info: {
				...(serviceTier === undefined ? {} : { service_tier: serviceTier }),
				total_token_usage: codexUsage(total),
				...(last ? { last_token_usage: codexUsage(last) } : {}),
			},
		},
	});
}

function codexLineWithReasoning(
	total: TestCodexVector,
	totalReasoning: number | null,
	lastReasoning: number | null,
): string {
	return JSON.stringify({
		timestamp: "2026-08-01T10:00:00.000Z",
		type: "event_msg",
		payload: {
			type: "token_count",
			info: {
				total_token_usage: {
					...codexUsage(total),
					reasoning_output_tokens: totalReasoning,
				},
				last_token_usage: {
					...codexUsage(total),
					reasoning_output_tokens: lastReasoning,
				},
			},
		},
	});
}

function codexUsage(value: TestCodexVector) {
	return {
		input_tokens: value.input,
		cached_input_tokens: value.cacheRead,
		output_tokens: value.output,
		reasoning_output_tokens: value.reasoning,
	};
}
