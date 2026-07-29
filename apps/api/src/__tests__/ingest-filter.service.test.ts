import { describe, expect, test } from "bun:test";
import {
	MAX_FILTER_PASSES,
	SecretFilterConvergenceError,
} from "@rudel/secret-filter";
import {
	createIngestFilterWorkerError,
	getIngestFilterWorkerError,
} from "../services/ingest-filter.error.js";
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

	test("preserves a structured convergence failure across worker serialization", () => {
		const response = createIngestFilterWorkerError(
			42,
			new SecretFilterConvergenceError(),
		);
		const error = getIngestFilterWorkerError(response);

		expect(response).toEqual({
			status: "error",
			requestId: 42,
			reason: "did-not-converge",
			maxPasses: MAX_FILTER_PASSES,
		});
		expect(error).toBeInstanceOf(SecretFilterConvergenceError);
		expect(error).toMatchObject({ maxPasses: MAX_FILTER_PASSES });
	});
});
