import { describe, expect, test } from "bun:test";
import { filterSessionTextFieldsOffThread } from "../services/ingest-filter.service.js";

const PRIVATE_KEY = [
	"-----BEGIN PRIVATE KEY-----",
	"CANARY".padEnd(64, "A"),
	"-----END PRIVATE KEY-----",
].join("\n");
const AWS_KEY = "AKIACANARY234567ABCD";

describe("filterSessionTextFieldsOffThread", () => {
	test("filters JSON-escaped private keys and subagent secrets", async () => {
		const result = await filterSessionTextFieldsOffThread({
			content: JSON.stringify({ privateKey: PRIVATE_KEY }),
			subagents: [
				{ agentId: "agent-1", content: `AWS_ACCESS_KEY_ID=${AWS_KEY}` },
			],
		});

		expect(result.content).toBe(
			JSON.stringify({ privateKey: "[REDACTED:private-key]" }),
		);
		expect(result.subagents).toEqual([
			{
				agentId: "agent-1",
				content: "AWS_ACCESS_KEY_ID=[REDACTED:aws-access-key-id]",
			},
		]);
		expect(result.counts).toEqual({
			"aws-access-key-id": 1,
			"private-key": 1,
		});
	});

	test("keeps the API event loop responsive while filtering a large transcript", async () => {
		const content = "ordinary transcript line\n".repeat(350_000);
		let filteringSettled = false;
		const filtering = filterSessionTextFieldsOffThread({
			content,
			subagents: undefined,
		}).then((result) => {
			filteringSettled = true;
			return result;
		});

		await Bun.sleep(0);

		expect(filteringSettled).toBe(false);
		const result = await filtering;
		expect(result.content).toBe(content);
		expect(result.counts).toEqual({});
	}, 20_000);
});
