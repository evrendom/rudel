import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

setDefaultTimeout(30_000);

interface TestProxy {
	baseUrl: string;
	stop: () => Promise<void>;
}

describe("wrapped share HTTP rate limiting behind a trusted proxy", () => {
	let api: ApiTestServer;
	let proxy: TestProxy;

	beforeAll(async () => {
		api = await startApiTestServer({
			FLY_APP_NAME: undefined,
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_CAPACITY: "50",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_MAX: "2",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_SOURCE_MAX: "10",
			STATIC_DIR: "../../apps/web",
			TRUSTED_PROXY_HOPS: "1",
		});
		proxy = startTestProxy(api.baseUrl);
	});

	afterAll(async () => {
		await proxy?.stop();
		await api?.stop();
	});

	test("rate limits all three anonymous entrypoints", async () => {
		const rpcShareId = `rpc-${crypto.randomUUID()}`;
		const pageShareId = `page-${crypto.randomUUID()}`;
		const imageShareId = `image-${crypto.randomUUID()}`;

		expect([
			await callPublicRpc(proxy.baseUrl, "198.51.100.10", rpcShareId),
			await callPublicRpc(proxy.baseUrl, "198.51.100.10", rpcShareId),
			await callPublicRpc(proxy.baseUrl, "198.51.100.10", rpcShareId),
		]).toEqual([404, 404, 429]);
		expect([
			await callPublicPage(proxy.baseUrl, "198.51.100.11", pageShareId),
			await callPublicPage(proxy.baseUrl, "198.51.100.11", pageShareId),
			await callPublicPage(proxy.baseUrl, "198.51.100.11", pageShareId),
		]).toEqual([200, 200, 429]);
		expect([
			await callPublicImage(proxy.baseUrl, "198.51.100.12", imageShareId),
			await callPublicImage(proxy.baseUrl, "198.51.100.12", imageShareId),
			await callPublicImage(proxy.baseUrl, "198.51.100.12", imageShareId),
		]).toEqual([404, 404, 429]);
	});

	test("shares one per-share counter across RPC, page, and image traffic", async () => {
		const shareId = `shared-counter-${crypto.randomUUID()}`;
		const clientIp = "198.51.100.20";

		expect(await callPublicRpc(proxy.baseUrl, clientIp, shareId)).toBe(404);
		expect(await callPublicPage(proxy.baseUrl, clientIp, shareId)).toBe(200);
		expect(await callPublicImage(proxy.baseUrl, clientIp, shareId)).toBe(429);
	});

	test("enforces the limit across concurrent requests", async () => {
		const shareId = `concurrent-${crypto.randomUUID()}`;
		const requests = Array.from({ length: 8 }, () =>
			callPublicRpc(proxy.baseUrl, "198.51.100.30", shareId),
		);
		const statuses = await Promise.all(requests);

		expect(statuses.sort((left, right) => left - right)).toEqual([
			404, 404, 429, 429, 429, 429, 429, 429,
		]);
	});

	test("keeps clients behind one trusted proxy in independent buckets", async () => {
		const firstClientIp = "198.51.100.40";
		const secondClientIp = "198.51.100.41";

		for (let request = 0; request < 10; request += 1) {
			const statuses = await Promise.all([
				callPublicRpc(
					proxy.baseUrl,
					firstClientIp,
					`first-client-${request}-${crypto.randomUUID()}`,
				),
				callPublicRpc(
					proxy.baseUrl,
					secondClientIp,
					`second-client-${request}-${crypto.randomUUID()}`,
				),
			]);
			expect(statuses).toEqual([404, 404]);
		}

		expect(
			await callPublicRpc(
				proxy.baseUrl,
				firstClientIp,
				`first-client-limited-${crypto.randomUUID()}`,
			),
		).toBe(429);
		expect(
			await callPublicRpc(
				proxy.baseUrl,
				secondClientIp,
				`second-client-limited-${crypto.randomUUID()}`,
			),
		).toBe(429);
	});
});

describe("wrapped share capacity churn over HTTP", () => {
	let api: ApiTestServer;
	let proxy: TestProxy;

	beforeAll(async () => {
		api = await startApiTestServer({
			FLY_APP_NAME: undefined,
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_CAPACITY: "3",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_MAX: "2",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_SOURCE_MAX: "3",
			TRUSTED_PROXY_HOPS: "1",
		});
		proxy = startTestProxy(api.baseUrl);
	});

	afterAll(async () => {
		await proxy?.stop();
		await api?.stop();
	});

	test("rejects source churn before it can reset a throttled share", async () => {
		const validShareId = `protected-${crypto.randomUUID()}`;
		const attackerIp = "198.51.100.50";

		expect(await callPublicRpc(proxy.baseUrl, attackerIp, validShareId)).toBe(
			404,
		);
		expect(await callPublicRpc(proxy.baseUrl, attackerIp, validShareId)).toBe(
			404,
		);
		expect(
			await callPublicRpc(
				proxy.baseUrl,
				attackerIp,
				`attacker-allowed-${crypto.randomUUID()}`,
			),
		).toBe(404);

		expect(await readHealth(api.baseUrl)).toMatchObject({
			rateLimits: {
				wrappedShareLookup: {
					cardinality: 2,
					evictions: 0,
					rejectedTraffic: 0,
				},
			},
		});

		expect(
			await callPublicRpc(
				proxy.baseUrl,
				attackerIp,
				`attacker-rejected-${crypto.randomUUID()}`,
			),
		).toBe(429);
		expect(
			await callPublicRpc(proxy.baseUrl, "198.51.100.51", validShareId),
		).toBe(429);
		expect(await readHealth(api.baseUrl)).toMatchObject({
			rateLimits: {
				wrappedShareLookup: {
					cardinality: 2,
					evictions: 0,
					rejectedTraffic: 2,
				},
			},
		});
	});
});

describe("wrapped share source trust over HTTP", () => {
	let directApi: ApiTestServer;
	let directProxy: TestProxy;
	let flyApi: ApiTestServer;

	beforeAll(async () => {
		directApi = await startApiTestServer({
			FLY_APP_NAME: undefined,
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_CAPACITY: "10",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_MAX: "10",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_SOURCE_MAX: "1",
			TRUSTED_PROXY_HOPS: "0",
		});
		directProxy = startTestProxy(directApi.baseUrl);
		flyApi = await startApiTestServer({
			FLY_APP_NAME: "rudel-test",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_CAPACITY: "10",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_MAX: "10",
			RATE_LIMIT_WRAPPED_SHARE_LOOKUP_SOURCE_MAX: "1",
			TRUSTED_PROXY_HOPS: "0",
		});
	});

	afterAll(async () => {
		await directProxy?.stop();
		await directApi?.stop();
		await flyApi?.stop();
	});

	test("ignores forwarded addresses when no proxy is trusted", async () => {
		expect(
			await callPublicRpc(
				directProxy.baseUrl,
				"198.51.100.60",
				`direct-first-${crypto.randomUUID()}`,
			),
		).toBe(404);
		expect(
			await callPublicRpc(
				directProxy.baseUrl,
				"198.51.100.61",
				`direct-second-${crypto.randomUUID()}`,
			),
		).toBe(429);
	});

	test("uses Fly-Client-IP for independent direct Fly clients", async () => {
		expect(
			await callFlyPublicRpc(
				flyApi.baseUrl,
				"198.51.100.70",
				`fly-first-${crypto.randomUUID()}`,
			),
		).toBe(404);
		expect(
			await callFlyPublicRpc(
				flyApi.baseUrl,
				"198.51.100.71",
				`fly-second-${crypto.randomUUID()}`,
			),
		).toBe(404);
		expect(
			await callFlyPublicRpc(
				flyApi.baseUrl,
				"198.51.100.70",
				`fly-first-limited-${crypto.randomUUID()}`,
			),
		).toBe(429);
	});
});

function startTestProxy(targetBaseUrl: string): TestProxy {
	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			const clientIp = request.headers.get("x-test-client-ip");
			if (!clientIp) {
				return new Response("Missing test client IP", { status: 400 });
			}

			const requestUrl = new URL(request.url);
			const headers = new Headers(request.headers);
			const forwardedFor = headers.get("x-forwarded-for");
			headers.delete("connection");
			headers.delete("content-length");
			headers.delete("host");
			headers.delete("x-test-client-ip");
			headers.set(
				"x-forwarded-for",
				forwardedFor ? `${forwardedFor}, ${clientIp}` : clientIp,
			);

			const body =
				request.method === "GET" || request.method === "HEAD"
					? undefined
					: await request.arrayBuffer();
			return fetch(
				new URL(`${requestUrl.pathname}${requestUrl.search}`, targetBaseUrl),
				{
					body,
					headers,
					method: request.method,
				},
			);
		},
	});

	return {
		baseUrl: server.url.origin,
		async stop() {
			await server.stop(true);
		},
	};
}

async function callPublicRpc(
	baseUrl: string,
	clientIp: string,
	shareId: string,
): Promise<number> {
	const response = await fetch(`${baseUrl}/rpc/wrappedShare/getPublic`, {
		body: JSON.stringify({ json: { shareId } }),
		headers: {
			"Content-Type": "application/json",
			"X-Forwarded-For": "192.0.2.250",
			"X-Test-Client-IP": clientIp,
		},
		method: "POST",
	});
	await response.arrayBuffer();
	return response.status;
}

async function callPublicPage(
	baseUrl: string,
	clientIp: string,
	shareId: string,
): Promise<number> {
	const response = await fetch(`${baseUrl}/wrapped/${shareId}`, {
		headers: {
			"X-Forwarded-For": "192.0.2.250",
			"X-Test-Client-IP": clientIp,
		},
	});
	await response.arrayBuffer();
	return response.status;
}

async function callPublicImage(
	baseUrl: string,
	clientIp: string,
	shareId: string,
): Promise<number> {
	const response = await fetch(`${baseUrl}/wrapped/${shareId}/x-card.png`, {
		headers: {
			"X-Forwarded-For": "192.0.2.250",
			"X-Test-Client-IP": clientIp,
		},
	});
	await response.arrayBuffer();
	return response.status;
}

async function callFlyPublicRpc(
	baseUrl: string,
	clientIp: string,
	shareId: string,
): Promise<number> {
	const response = await fetch(`${baseUrl}/rpc/wrappedShare/getPublic`, {
		body: JSON.stringify({ json: { shareId } }),
		headers: {
			"Content-Type": "application/json",
			"Fly-Client-IP": clientIp,
			"X-Forwarded-For": "192.0.2.250, 203.0.113.250",
		},
		method: "POST",
	});
	await response.arrayBuffer();
	return response.status;
}

async function readHealth(baseUrl: string): Promise<unknown> {
	const response = await fetch(`${baseUrl}/health`);
	expect(response.ok).toBe(true);
	return response.json();
}
