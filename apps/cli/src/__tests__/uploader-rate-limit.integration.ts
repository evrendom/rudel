import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import { uploadSession } from "../lib/uploader.js";
import {
	signUpTestUser,
	startTestServer,
	type TestServer,
} from "./helpers/bun-server.js";

setDefaultTimeout(30_000);

let server: TestServer;
let bearerToken: string;

beforeAll(async () => {
	server = await startTestServer({
		RATE_LIMIT_INGEST_BYTES_MAX: "1",
		RATE_LIMIT_INGEST_REQUESTS_MAX: "10",
	});
	bearerToken = await signUpTestUser(server.baseUrl);
});

afterAll(async () => {
	await server?.stop();
});

describe("CLI ingest rate-limit messages", () => {
	test("formats the byte-limit reason returned by the real API", async () => {
		const result = await uploadSession(
			{
				content: "ab",
				projectPath: "/test/cli-rate-limit",
				sessionId: `cli-byte-limit-${Date.now()}`,
				source: "claude_code",
			},
			{
				endpoint: server.rpcUrl,
				token: bearerToken,
			},
		);

		expect(result).toEqual({
			success: false,
			error:
				"Ingest byte limit reached (0.00 MiB per 60 min). Wait and retry with: rudel upload --retry",
			attempts: 1,
			rateLimited: true,
		});
	});
});
