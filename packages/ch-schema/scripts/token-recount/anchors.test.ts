import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProviderAnchors } from "./anchors.js";

test("loads exact per-class provider anchors", async () => {
	const directory = mkdtempSync(join(tmpdir(), "token-recount-anchors-"));
	const path = join(directory, "anchors.json");
	writeFileSync(
		path,
		JSON.stringify({
			version: 1,
			anchors: [
				{
					name: "controlled Claude session",
					source: "claude_code",
					organization_id: "owner-one",
					user_id: "user-one",
					session_id: "session-one",
					verified_at: "2026-08-02T10:00:00.000Z",
					features: ["cache_1h", "subagent_heavy"],
					evidence_reference: ".context/anchors/claude.png",
					provider_tokens: {
						uncached_input_tokens: 10,
						cache_read_input_tokens: 20,
						cache_creation_5m_input_tokens: 30,
						cache_creation_1h_input_tokens: 40,
						output_tokens: 50,
					},
				},
			],
		}),
	);

	const anchors = await readProviderAnchors(path, true);

	expect(anchors).toHaveLength(1);
	expect(anchors[0]?.providerTokens).toEqual({
		uncachedInputTokens: 10,
		cacheReadInputTokens: 20,
		cacheCreation5mInputTokens: 30,
		cacheCreation1hInputTokens: 40,
		outputTokens: 50,
	});
	expect(anchors[0]?.features).toEqual(["cache_1h", "subagent_heavy"]);
});

test("allows an absent optional anchor file and rejects an absent required one", async () => {
	const missing = join(tmpdir(), `missing-token-anchors-${Date.now()}.json`);

	expect(await readProviderAnchors(missing, false)).toEqual([]);
	await expect(readProviderAnchors(missing, true)).rejects.toThrow(
		"does not exist",
	);
});
