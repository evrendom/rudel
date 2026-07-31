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
	type IngestSessionInput,
	REDACTION_BUDGET_EXCEEDED_CODE,
} from "@rudel/api-routes";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

setDefaultTimeout(60_000);

const OVER_BUDGET_CONTENT = "AWS_ACCESS_KEY_ID=AKIACANARY234567ABCD";

interface QueueMetrics {
	readonly activeJobs: number;
	readonly cancellationCount: number;
	readonly queueDepth: number;
	readonly queuedBytes: number;
	readonly rejectionCount: number;
	readonly timeoutCount: number;
	readonly waitTimeMs: {
		readonly average: number;
		readonly last: number;
		readonly max: number;
	};
}

describe("ingest filter queue defaults over HTTP", () => {
	let server: ApiTestServer;
	let bearerToken: string;

	beforeAll(async () => {
		server = await startApiTestServer({
			INGEST_FILTER_QUEUE_GLOBAL_MAX_BYTES: undefined,
			INGEST_FILTER_QUEUE_GLOBAL_MAX_JOBS: undefined,
			INGEST_FILTER_QUEUE_PER_USER_MAX_BYTES: undefined,
			INGEST_FILTER_QUEUE_PER_USER_MAX_JOBS: undefined,
			INGEST_FILTER_QUEUE_TIMEOUT_MS: undefined,
		});
		bearerToken = await signUpTestUser(server.baseUrl, "queue-defaults");
	});

	afterAll(async () => {
		await server?.stop();
	});

	test("accepts the CLI's five concurrent default uploads", async () => {
		const content = `${OVER_BUDGET_CONTENT}\n`.repeat(300_000);
		const responses = await Promise.all(
			Array.from({ length: 5 }, (_, index) =>
				callIngest(
					server.baseUrl,
					bearerToken,
					createIngestInput(`cli-concurrency-${index}`, content),
				),
			),
		);

		expect(responses.map((response) => response.status)).toEqual([
			422, 422, 422, 422, 422,
		]);
		const errors = await Promise.all(responses.map(readRpcError));
		expect(errors.map((error) => error.code)).toEqual([
			REDACTION_BUDGET_EXCEEDED_CODE,
			REDACTION_BUDGET_EXCEEDED_CODE,
			REDACTION_BUDGET_EXCEEDED_CODE,
			REDACTION_BUDGET_EXCEEDED_CODE,
			REDACTION_BUDGET_EXCEEDED_CODE,
		]);
		expect(await readQueueMetrics(server.baseUrl)).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
			rejectionCount: 0,
		});
	}, 60_000);
});

describe("ingest filter queue over HTTP", () => {
	let server: ApiTestServer;
	let firstTenantToken: string;
	let secondTenantToken: string;

	beforeAll(async () => {
		server = await startApiTestServer({
			INGEST_FILTER_QUEUE_GLOBAL_MAX_BYTES: String(64 * 1024 * 1024),
			INGEST_FILTER_QUEUE_GLOBAL_MAX_JOBS: "2",
			INGEST_FILTER_QUEUE_PER_USER_MAX_BYTES: String(64 * 1024 * 1024),
			INGEST_FILTER_QUEUE_PER_USER_MAX_JOBS: "2",
			INGEST_FILTER_QUEUE_TIMEOUT_MS: "30000",
		});
		[firstTenantToken, secondTenantToken] = await Promise.all([
			signUpTestUser(server.baseUrl, "queue-first"),
			signUpTestUser(server.baseUrl, "queue-second"),
		]);
	});

	afterAll(async () => {
		await server?.stop();
	});

	test("returns retryable overload data and recovers another tenant after a disconnect", async () => {
		const largeContent = "ordinary transcript line\n".repeat(2_000_000);
		const firstController = new AbortController();
		const firstRequest = callIngest(
			server.baseUrl,
			firstTenantToken,
			createIngestInput("disconnect-active", largeContent),
			firstController.signal,
		);
		await waitForQueueMetrics(
			server.baseUrl,
			(metrics) => metrics.queueDepth === 1 && metrics.activeJobs === 1,
		);

		const acceptedSecondTenant = callIngest(
			server.baseUrl,
			secondTenantToken,
			createIngestInput("accepted-second-tenant", OVER_BUDGET_CONTENT),
		);
		const atCapacity = await waitForQueueMetrics(
			server.baseUrl,
			(metrics) => metrics.queueDepth === 2 && metrics.activeJobs === 1,
		);
		expect(atCapacity.queuedBytes).toBe(
			Buffer.byteLength(largeContent, "utf8") +
				Buffer.byteLength(OVER_BUDGET_CONTENT, "utf8"),
		);

		const rejected = await callIngest(
			server.baseUrl,
			secondTenantToken,
			createIngestInput("rejected-at-capacity", OVER_BUDGET_CONTENT),
		);
		expect(rejected.status).toBe(503);
		expect(await readRpcError(rejected)).toEqual({
			code: "SERVICE_UNAVAILABLE",
			limit: "global-jobs",
			reason: "ingest_filter_queue_full",
			retryAfterMs: 1_000,
		});

		const afterRejection = await readQueueMetrics(server.baseUrl);
		expect(afterRejection).toMatchObject({
			activeJobs: 1,
			queueDepth: 2,
			rejectionCount: 1,
		});

		firstController.abort();
		await expect(firstRequest).rejects.toThrow();

		const secondTenantResponse = await acceptedSecondTenant;
		expect(secondTenantResponse.status).toBe(422);
		expect((await readRpcError(secondTenantResponse)).code).toBe(
			REDACTION_BUDGET_EXCEEDED_CODE,
		);

		const afterRecovery = await waitForQueueMetrics(
			server.baseUrl,
			(metrics) => metrics.queueDepth === 0,
		);
		expect(afterRecovery).toMatchObject({
			activeJobs: 0,
			cancellationCount: 1,
			queueDepth: 0,
			queuedBytes: 0,
			rejectionCount: 1,
			timeoutCount: 0,
		});
		expect(afterRecovery.waitTimeMs.max).toBeGreaterThan(0);
	}, 60_000);
});

describe("ingest filter queue timeout over HTTP", () => {
	let server: ApiTestServer;
	let bearerToken: string;

	beforeAll(async () => {
		server = await startApiTestServer({
			INGEST_FILTER_QUEUE_GLOBAL_MAX_BYTES: String(96 * 1024 * 1024),
			INGEST_FILTER_QUEUE_GLOBAL_MAX_JOBS: "2",
			INGEST_FILTER_QUEUE_PER_USER_MAX_BYTES: String(96 * 1024 * 1024),
			INGEST_FILTER_QUEUE_PER_USER_MAX_JOBS: "2",
			INGEST_FILTER_QUEUE_TIMEOUT_MS: "500",
		});
		bearerToken = await signUpTestUser(server.baseUrl, "queue-timeout");
	});

	afterAll(async () => {
		await server?.stop();
	});

	test("returns a retryable timeout and restarts the worker for the next request", async () => {
		const largeContent = "ordinary transcript line\n".repeat(3_000_000);
		const timedOut = await callIngest(
			server.baseUrl,
			bearerToken,
			createIngestInput("times-out", largeContent),
		);
		expect(timedOut.status).toBe(504);
		expect(await readRpcError(timedOut)).toEqual({
			code: "GATEWAY_TIMEOUT",
			limit: undefined,
			reason: "ingest_filter_queue_timeout",
			retryAfterMs: 1_000,
		});

		const recovered = await callIngest(
			server.baseUrl,
			bearerToken,
			createIngestInput("after-timeout", OVER_BUDGET_CONTENT),
		);
		expect(recovered.status).toBe(422);
		expect((await readRpcError(recovered)).code).toBe(
			REDACTION_BUDGET_EXCEEDED_CODE,
		);

		const metrics = await waitForQueueMetrics(
			server.baseUrl,
			(current) => current.queueDepth === 0,
		);
		expect(metrics).toMatchObject({
			activeJobs: 0,
			queueDepth: 0,
			queuedBytes: 0,
			timeoutCount: 1,
		});
	}, 60_000);
});

async function signUpTestUser(
	baseUrl: string,
	namePrefix: string,
): Promise<string> {
	const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: `${namePrefix}-${crypto.randomUUID()}@example.com`,
			name: `${namePrefix} test`,
			password: "ingest-filter-queue-test-password",
		}),
	});

	expect(response.ok).toBe(true);
	const body: unknown = await response.json();
	assert(isAuthResponse(body));
	return body.token;
}

function createIngestInput(
	sessionId: string,
	content: string,
): IngestSessionInput {
	return {
		content,
		projectPath: "/test/ingest-filter-queue",
		sessionId: `${sessionId}-${crypto.randomUUID()}`,
		source: "claude_code",
	};
}

async function callIngest(
	baseUrl: string,
	bearerToken: string,
	input: IngestSessionInput,
	signal: AbortSignal | undefined = undefined,
): Promise<Response> {
	return fetch(`${baseUrl}/rpc/ingestSession`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${bearerToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ json: input }),
		signal,
	});
}

async function waitForQueueMetrics(
	baseUrl: string,
	predicate: (metrics: QueueMetrics) => boolean,
): Promise<QueueMetrics> {
	const deadline = Date.now() + 10_000;
	let latest = await readQueueMetrics(baseUrl);

	while (Date.now() < deadline) {
		latest = await readQueueMetrics(baseUrl);
		if (predicate(latest)) {
			return latest;
		}
		await Bun.sleep(10);
	}

	throw new Error(
		`Queue metrics did not reach the expected state: ${JSON.stringify(latest)}`,
	);
}

async function readQueueMetrics(baseUrl: string): Promise<QueueMetrics> {
	const response = await fetch(`${baseUrl}/health`);
	expect(response.ok).toBe(true);
	const body: unknown = await response.json();
	assert(isHealthResponse(body));
	return body.queues.ingestFilter;
}

async function readRpcError(response: Response): Promise<{
	code: string;
	limit: string | undefined;
	reason: string | undefined;
	retryAfterMs: number | undefined;
}> {
	const body: unknown = await response.json();
	assert(isRecord(body));
	assert(isRecord(body.json));
	assert(typeof body.json.code === "string");
	const data = isRecord(body.json.data) ? body.json.data : {};

	return {
		code: body.json.code,
		limit: typeof data.limit === "string" ? data.limit : undefined,
		reason: typeof data.reason === "string" ? data.reason : undefined,
		retryAfterMs:
			typeof data.retryAfterMs === "number" ? data.retryAfterMs : undefined,
	};
}

function isAuthResponse(value: unknown): value is { token: string } {
	return isRecord(value) && typeof value.token === "string";
}

function isHealthResponse(value: unknown): value is {
	queues: { ingestFilter: QueueMetrics };
} {
	if (!isRecord(value) || !isRecord(value.queues)) {
		return false;
	}
	const metrics = value.queues.ingestFilter;
	if (!isRecord(metrics) || !isRecord(metrics.waitTimeMs)) {
		return false;
	}

	return (
		typeof metrics.activeJobs === "number" &&
		typeof metrics.cancellationCount === "number" &&
		typeof metrics.queueDepth === "number" &&
		typeof metrics.queuedBytes === "number" &&
		typeof metrics.rejectionCount === "number" &&
		typeof metrics.timeoutCount === "number" &&
		typeof metrics.waitTimeMs.average === "number" &&
		typeof metrics.waitTimeMs.last === "number" &&
		typeof metrics.waitTimeMs.max === "number"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
