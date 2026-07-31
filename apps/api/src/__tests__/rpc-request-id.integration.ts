import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import { sqlClient } from "../db.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

const TEST_EMAIL = `rpc-request-id-${crypto.randomUUID()}@example.com`;
const TEST_PASSWORD = "rpc-request-id-test-password";

let server: ApiTestServer;

setDefaultTimeout(30_000);

beforeAll(async () => {
	server = await startApiTestServer({
		CLICKHOUSE_URL: "http://127.0.0.1:1",
		FLY_APP_NAME: "rudel-test",
		POSTHOG_API_KEY: undefined,
		RESEND_API_KEY: undefined,
		SLACK_WEBHOOK_URL: undefined,
	});
});

afterAll(async () => {
	await server?.stop();
	await sqlClient`
		DELETE FROM "user"
		WHERE email = ${TEST_EMAIL}
	`;
});

describe("RPC request ID correlation", () => {
	test("returns the logged request ID for an internal Team API failure", async () => {
		const token = await signUpTestUser();
		const response = await fetch(
			`${server.baseUrl}/rpc/analytics/developers/teamCards`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ json: { days: 30 } }),
			},
		);
		const body: unknown = await response.json();
		const headerRequestId = response.headers.get("X-Request-ID");
		const error = readRpcError(body);
		if (!headerRequestId) {
			throw new Error("RPC response did not include X-Request-ID");
		}

		expect(response.status).toBe(500);
		expect(headerRequestId).toMatch(/^[0-9a-f-]{36}$/u);
		expect(error).toEqual({
			message: "Internal Server Error",
			requestId: headerRequestId,
		});
		expect(JSON.stringify(body)).not.toContain("127.0.0.1");
		expect(JSON.stringify(body)).not.toContain("ClickHouse");

		const output = await waitForOutput(headerRequestId);
		const rawErrorLog = output
			.split("\n")
			.find((line) =>
				line.includes(
					"Unable to connect. Is the computer able to access the url?",
				),
			);
		if (!rawErrorLog) {
			throw new Error("Server output did not include the raw Team API failure");
		}
		expect(rawErrorLog).toContain(headerRequestId);
		expect(rawErrorLog).toContain(
			"Unable to connect. Is the computer able to access the url?",
		);
	});
});

async function signUpTestUser(): Promise<string> {
	const response = await fetch(`${server.baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: TEST_EMAIL,
			name: "RPC Request ID Test",
			password: TEST_PASSWORD,
		}),
	});
	expect(response.ok).toBe(true);

	const body: unknown = await response.json();
	if (
		typeof body !== "object" ||
		body === null ||
		!("token" in body) ||
		typeof body.token !== "string"
	) {
		throw new Error("Sign-up response did not include a token");
	}

	return body.token;
}

function readRpcError(value: unknown): {
	message: string;
	requestId: string;
} {
	if (
		typeof value !== "object" ||
		value === null ||
		!("json" in value) ||
		typeof value.json !== "object" ||
		value.json === null ||
		!("message" in value.json) ||
		typeof value.json.message !== "string" ||
		!("data" in value.json) ||
		typeof value.json.data !== "object" ||
		value.json.data === null ||
		!("requestId" in value.json.data) ||
		typeof value.json.data.requestId !== "string"
	) {
		throw new Error("RPC response did not include a message and request ID");
	}

	return {
		message: value.json.message,
		requestId: value.json.data.requestId,
	};
}

async function waitForOutput(requestId: string): Promise<string> {
	const deadline = Date.now() + 2_000;

	while (Date.now() < deadline) {
		const output = server.readOutput();
		if (output.includes(requestId)) {
			return output;
		}
		await Bun.sleep(20);
	}

	return server.readOutput();
}
