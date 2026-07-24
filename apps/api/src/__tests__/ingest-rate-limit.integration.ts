import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import {
	INGEST_LIMIT_REASONS,
	type IngestSessionInput,
} from "@rudel/api-routes";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

setDefaultTimeout(30_000);

let server: ApiTestServer;
let bearerToken: string;

beforeAll(async () => {
	server = await startApiTestServer({
		RATE_LIMIT_INGEST_BYTES_MAX: "1",
		RATE_LIMIT_INGEST_REQUESTS_MAX: "1",
	});
	bearerToken = await signUpTestUser(server.baseUrl);
});

afterAll(async () => {
	await server?.stop();
});

describe("ingest rate-limit oRPC errors", () => {
	test("preserves byte and request reason discriminators over HTTP", async () => {
		const byteLimited = await callIngest({
			content: "ab",
			projectPath: "/test/rate-limit",
			sessionId: `byte-limit-${Date.now()}`,
			source: "claude_code",
		});
		expect(byteLimited.status).toBe(429);
		expect(readRpcErrorReason(byteLimited.body)).toBe(
			INGEST_LIMIT_REASONS.byteLimit,
		);

		const requestLimited = await callIngest({
			content: "",
			projectPath: "/test/rate-limit",
			sessionId: `request-limit-${Date.now()}`,
			source: "claude_code",
		});
		expect(requestLimited.status).toBe(429);
		expect(readRpcErrorReason(requestLimited.body)).toBe(
			INGEST_LIMIT_REASONS.requestLimit,
		);
	});
});

async function signUpTestUser(baseUrl: string): Promise<string> {
	const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: `ingest-rate-limit-${crypto.randomUUID()}@example.com`,
			name: "Ingest Rate Limit Test",
			password: "ingest-rate-limit-test-password",
		}),
	});

	expect(response.ok).toBe(true);
	const body: unknown = await response.json();
	assert(isAuthResponse(body));
	return body.token;
}

async function callIngest(input: IngestSessionInput) {
	const response = await fetch(`${server.baseUrl}/rpc/ingestSession`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${bearerToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ json: input }),
	});

	return {
		body: await response.json(),
		status: response.status,
	};
}

function readRpcErrorReason(value: unknown): string {
	if (
		typeof value === "object" &&
		value !== null &&
		"json" in value &&
		typeof value.json === "object" &&
		value.json !== null &&
		"data" in value.json &&
		typeof value.json.data === "object" &&
		value.json.data !== null &&
		"reason" in value.json.data &&
		typeof value.json.data.reason === "string"
	) {
		return value.json.data.reason;
	}
	throw new Error("RPC response did not include json.data.reason");
}

function isAuthResponse(value: unknown): value is { token: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"token" in value &&
		typeof value.token === "string"
	);
}
