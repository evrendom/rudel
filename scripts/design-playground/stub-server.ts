import { randomBytes } from "node:crypto";
import {
	type IngestStubRespondInfo,
	startIngestStub,
} from "../../apps/cli/src/__tests__/helpers/ingest-stub.js";
import { validateLoopbackUrl } from "./safety.js";
import type {
	PlaygroundIdentity,
	PlaygroundOrganization,
	PlaygroundUser,
	StubBehavior,
	StubLogEntry,
} from "./types.js";

const MAX_LOG_ENTRIES = 300;
const STAGGER_DELAYS_MS = [200, 650, 1_400, 2_600, 4_200, 8_000];
const UPLOADED_MIXED_SESSION_IDS = new Set([
	"fixture-current-01",
	"fixture-current-02",
	"fixture-current-03",
	"fixture-current-04",
	"fixture-current-05",
	"fixture-current-06",
	"fixture-codex-01",
	"fixture-codex-04",
	"fixture-api-01",
	"fixture-api-02",
]);
const DEFAULT_IDENTITY: PlaygroundIdentity = {
	user: {
		id: "user_playground_01",
		email: "designer@loopback.invalid",
		name: "Rudel Designer",
	},
	organizations: [
		{
			id: "org_playground_alpha",
			name: "North Star Studio",
			slug: "north-star-studio",
		},
	],
};

export interface PlaygroundStub {
	readonly loopbackBase: string;
	readonly secret: string;
	readonly getLogs: () => readonly StubLogEntry[];
	readonly getTripwire: () => string | null;
	readonly stop: () => Promise<void>;
}

interface StubConfiguration {
	readonly behavior: StubBehavior;
	readonly identity: PlaygroundIdentity;
}

export function startPlaygroundStub(
	options: {
		readonly crashOnTripwire?: boolean;
		readonly secret?: string;
	} = {},
): PlaygroundStub {
	const secret = options.secret ?? randomBytes(24).toString("base64url");
	const logs: StubLogEntry[] = [];
	let behavior: StubBehavior = "ok";
	let identity = DEFAULT_IDENTITY;
	let ingestRequestCount = 0;
	let loopbackBase = "";
	let tripwire: string | null = null;

	const core = startIngestStub({
		hostname: "127.0.0.1",
		captureBodies: false,
		respond: async (info) => {
			if (!isLoopbackRequest(info.hostname)) {
				tripwire = `Rejected non-loopback Host: ${info.hostname}`;
				const response = new Response("Loopback Host required", {
					status: 421,
				});
				recordLog(logs, info, behavior, response.status);
				if (options.crashOnTripwire !== false) {
					setTimeout(() => {
						throw new Error(tripwire ?? "Playground Host tripwire fired");
					}, 0);
				}
				return response;
			}

			let response: Response;
			if (info.pathname === "/__scenario") {
				response = configureScenario(info, secret, (configuration) => {
					behavior = configuration.behavior;
					identity = configuration.identity;
					ingestRequestCount = 0;
				});
			} else {
				response = await respondToCliRequest({
					behavior,
					identity,
					info,
					ingestRequestCount,
					loopbackBase,
				});
				if (info.pathname === "/rpc/ingestSession") {
					ingestRequestCount++;
				}
			}
			recordLog(logs, info, behavior, response.status);
			return response;
		},
	});
	loopbackBase = core.loopbackBase;

	return {
		loopbackBase,
		secret,
		getLogs: () => [...logs],
		getTripwire: () => tripwire,
		stop: async () => {
			await core.server.stop(true);
		},
	};
}

export async function configurePlaygroundStub(
	baseUrl: string,
	secret: string,
	behavior: StubBehavior,
	identity: PlaygroundIdentity,
): Promise<void> {
	validateLoopbackUrl(baseUrl, "playground stub base");
	const response = await fetch(`${baseUrl}/__scenario`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-playground-token": secret,
		},
		body: JSON.stringify({ behavior, identity }),
	});
	if (!response.ok) {
		throw new Error(
			`Unable to configure the playground stub (${response.status})`,
		);
	}
}

function configureScenario(
	info: IngestStubRespondInfo,
	secret: string,
	applyConfiguration: (configuration: StubConfiguration) => void,
): Response {
	if (info.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}
	if (info.headers.get("x-playground-token") !== secret) {
		return new Response("Unauthorized", { status: 401 });
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(info.body);
	} catch {
		return new Response("Invalid configuration", { status: 400 });
	}
	const configuration = parseStubConfiguration(parsed);
	if (!configuration) {
		return new Response("Invalid configuration", { status: 400 });
	}
	applyConfiguration(configuration);
	return new Response(null, { status: 204 });
}

async function respondToCliRequest(options: {
	readonly behavior: StubBehavior;
	readonly identity: PlaygroundIdentity;
	readonly info: IngestStubRespondInfo;
	readonly ingestRequestCount: number;
	readonly loopbackBase: string;
}): Promise<Response> {
	const { behavior, identity, info, ingestRequestCount, loopbackBase } =
		options;
	if (info.pathname === "/api/auth/device/code") {
		return Response.json({
			device_code: "playground-device-code",
			user_code: "RUDEL-UX",
			verification_uri: `${loopbackBase}/verify/device`,
			verification_uri_complete: `${loopbackBase}/verify/device?user_code=RUDEL-UX`,
			expires_in: 120,
			interval: 0,
		});
	}
	if (info.pathname === "/api/auth/device/token") {
		return Response.json({
			access_token: "playground-device-access-token",
			token_type: "Bearer",
			expires_in: 300,
		});
	}
	if (info.pathname === "/api/auth/api-key/create") {
		return Response.json({
			id: "key_playground_01",
			key: "rudel-playground-login-api-key",
		});
	}
	if (info.pathname === "/verify/device") {
		return new Response(
			"<!doctype html><title>Rudel playground approved</title><p>Return to the terminal.</p>",
			{ headers: { "Content-Type": "text/html; charset=utf-8" } },
		);
	}
	if (info.pathname === "/rpc/cli/authStatus") {
		if (behavior === "auth") return unauthorizedResponse();
		return Response.json({ json: identity.user });
	}
	if (info.pathname === "/rpc/me") {
		if (behavior === "auth") return unauthorizedResponse();
		return Response.json({
			json: {
				...identity.user,
				image: null,
				activeOrganizationId: identity.organizations[0]?.id ?? null,
			},
		});
	}
	if (info.pathname === "/rpc/listMyOrganizations") {
		return Response.json({
			json: identity.organizations.map((organization) => ({
				...organization,
				logo: null,
			})),
		});
	}
	if (info.pathname === "/rpc/cli/sessionUploadStatus") {
		if (behavior === "auth") return unauthorizedResponse();
		const requestedSessionIds = readRequestedSessionIds(info.body);
		return Response.json({
			json: {
				organizationId:
					readRequestedOrganizationId(info.body) ??
					identity.organizations[0]?.id ??
					identity.user.id,
				uploadedSessionIds:
					behavior === "uploaded-mixed"
						? requestedSessionIds.filter((sessionId) =>
								UPLOADED_MIXED_SESSION_IDS.has(sessionId),
							)
						: [],
			},
		});
	}
	if (info.pathname !== "/rpc/ingestSession") {
		return new Response("Not found", { status: 404 });
	}

	if (behavior === "auth") return unauthorizedResponse();
	if (behavior === "rate-limit") {
		return Response.json(
			{
				json: {
					defined: false,
					code: "TOO_MANY_REQUESTS",
					status: 429,
					message:
						"Rate limit exceeded. Maximum 25 sessions per 60 minutes. Try again later.",
					data: {
						reason: "session_limit",
						limit: 25,
						windowSeconds: 3_600,
						current: 25,
					},
				},
			},
			{
				status: 429,
				headers: { "Retry-After": "42" },
			},
		);
	}
	if (behavior === "retry-choreo" && ingestRequestCount < 2) {
		return new Response("Service Unavailable", { status: 503 });
	}
	if (behavior === "too-large") {
		return Response.json(
			{
				json: {
					defined: false,
					code: "PAYLOAD_TOO_LARGE",
					status: 413,
					message: "Transcript exceeds the ingest size limit.",
					data: {
						reason: "transcript_too_large",
						actualBytes: 140 * 1024 * 1024,
						maxBytes: 128 * 1024 * 1024,
					},
				},
			},
			{ status: 413 },
		);
	}
	if (behavior === "server-error") {
		return new Response("Internal Server Error", { status: 500 });
	}
	if (behavior === "proxy-html") {
		return new Response(
			"<!doctype html><title>Sign in to your company proxy</title><h1>SSO required</h1>",
			{
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			},
		);
	}
	if (behavior === "staggered") {
		const delay =
			STAGGER_DELAYS_MS[ingestRequestCount % STAGGER_DELAYS_MS.length] ?? 200;
		await Bun.sleep(delay);
	}
	return Response.json({
		json: {
			success: true,
			sessionId: `playground-session-${ingestRequestCount + 1}`,
		},
	});
}

function recordLog(
	logs: StubLogEntry[],
	info: IngestStubRespondInfo,
	behavior: StubBehavior,
	status: number,
): void {
	logs.push({
		timestamp: new Date().toISOString(),
		method: info.method,
		path: info.pathname,
		scenario: behavior,
		status,
		bytes: info.bodyBytes,
	});
	if (logs.length > MAX_LOG_ENTRIES) {
		logs.splice(0, logs.length - MAX_LOG_ENTRIES);
	}
}

function parseStubConfiguration(value: unknown): StubConfiguration | null {
	if (!isRecord(value) || !isStubBehavior(value.behavior)) return null;
	const identity = parseIdentity(value.identity);
	if (!identity) return null;
	return { behavior: value.behavior, identity };
}

function parseIdentity(value: unknown): PlaygroundIdentity | null {
	if (!isRecord(value)) return null;
	const user = parseUser(value.user);
	if (!user || !Array.isArray(value.organizations)) return null;
	const organizations: PlaygroundOrganization[] = [];
	for (const item of value.organizations) {
		const organization = parseOrganization(item);
		if (!organization) return null;
		organizations.push(organization);
	}
	return { user, organizations };
}

function parseUser(value: unknown): PlaygroundUser | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.email !== "string" ||
		typeof value.name !== "string"
	) {
		return null;
	}
	return { id: value.id, email: value.email, name: value.name };
}

function parseOrganization(value: unknown): PlaygroundOrganization | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.name !== "string" ||
		typeof value.slug !== "string"
	) {
		return null;
	}
	return { id: value.id, name: value.name, slug: value.slug };
}

function isStubBehavior(value: unknown): value is StubBehavior {
	return (
		value === "auth" ||
		value === "ok" ||
		value === "uploaded-mixed" ||
		value === "proxy-html" ||
		value === "rate-limit" ||
		value === "retry-choreo" ||
		value === "server-error" ||
		value === "staggered" ||
		value === "too-large"
	);
}

function isLoopbackRequest(hostname: string): boolean {
	try {
		validateLoopbackUrl(`http://${hostname}`, "stub request host");
		return true;
	} catch {
		return false;
	}
}

function unauthorizedResponse(): Response {
	return new Response("Unauthorized", { status: 401 });
}

function readRequestedOrganizationId(body: string): string | null {
	const value = readRpcJsonBody(body);
	if (!value) return null;
	return typeof value.organizationId === "string" ? value.organizationId : null;
}

function readRequestedSessionIds(body: string): string[] {
	const value = readRpcJsonBody(body);
	if (!value || !Array.isArray(value.sessionIds)) return [];
	return value.sessionIds.filter(
		(sessionId): sessionId is string => typeof sessionId === "string",
	);
}

function readRpcJsonBody(body: string): Record<string, unknown> | null {
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return null;
	}
	if (!isRecord(value) || !isRecord(value.json)) return null;
	return value.json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
