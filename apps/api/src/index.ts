import { createHash } from "node:crypto";
import { join } from "node:path";
import { getLogger, withContext } from "@logtape/logtape";
import { RPCHandler } from "@orpc/server/fetch";
import { createAuth } from "./auth.js";
import {
	authenticateCliCredential,
	issueCliCredential,
	normalizeCliDeviceName,
} from "./cli-credentials.js";
import { db, pgClient } from "./db.js";
import {
	cloneRequestWithBodyLimit,
	getIngestSecurityConfig,
	IngestRequestTooLargeError,
} from "./ingest-security.js";
import { setupLogging } from "./logging.js";
import type { AppContext } from "./middleware.js";
import { router } from "./router.js";

await setupLogging();

const logger = getLogger(["rudel", "api", "http"]);

const socialProviders: Record<
	string,
	{ clientId: string; clientSecret: string }
> = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
	socialProviders.google = {
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
	};
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
	socialProviders.github = {
		clientId: process.env.GITHUB_CLIENT_ID,
		clientSecret: process.env.GITHUB_CLIENT_SECRET,
	};
}

const appURL = process.env.APP_URL ?? "http://localhost:4010";
const trustedOrigins = process.env.TRUSTED_ORIGINS
	? process.env.TRUSTED_ORIGINS.split(",").map((o) => o.trim())
	: ["http://localhost:4011"];

const auth = createAuth(db, {
	appURL,
	secret: process.env.BETTER_AUTH_SECRET,
	socialProviders,
	trustedOrigins,
	slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
});

const rpcHandler = new RPCHandler(router);

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:4011";
const STATIC_DIR = join(
	import.meta.dir,
	"..",
	process.env.STATIC_DIR ?? "public",
);
const CLI_AUTH_CODE_TTL_MS = 60_000;
const CLI_AUTH_IDENTIFIER_PREFIX = "cli-auth:";

interface CliAuthCodeValue {
	browserSessionId: string;
	userId: string;
	activeOrganizationId: string | null;
	state: string;
	codeChallenge: string;
	deviceName: string;
}

interface BrowserCliAuthSession {
	sessionId: string;
	userId: string;
	activeOrganizationId: string | null;
}

async function getAuthenticatedBrowserSession(
	request: Request,
): Promise<BrowserCliAuthSession | null> {
	const session = await auth.api.getSession({
		headers: request.headers,
	});
	if (!session?.session.id || !session.user.id) {
		return null;
	}

	return {
		sessionId: session.session.id,
		userId: session.user.id,
		activeOrganizationId:
			((session.session as Record<string, unknown>).activeOrganizationId as
				| string
				| null) ?? null,
	};
}

function corsHeaders(origin: string | null): Record<string, string> {
	if (origin !== ALLOWED_ORIGIN) return {};
	return {
		"Access-Control-Allow-Origin": ALLOWED_ORIGIN,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}

function jsonResponse(
	body: Record<string, unknown>,
	cors: Record<string, string>,
	status = 200,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...cors,
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

function isValidCliCallback(cliCallback: unknown): cliCallback is string {
	if (typeof cliCallback !== "string" || cliCallback.length > 2048) {
		return false;
	}

	try {
		const url = new URL(cliCallback);
		return url.protocol === "http:" && url.hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

function isValidState(state: unknown): state is string {
	return (
		typeof state === "string" &&
		state.length >= 16 &&
		state.length <= 256 &&
		/^[A-Za-z0-9_-]+$/.test(state)
	);
}

function isValidCodeChallenge(codeChallenge: unknown): codeChallenge is string {
	return (
		typeof codeChallenge === "string" &&
		codeChallenge.length >= 43 &&
		codeChallenge.length <= 128 &&
		/^[A-Za-z0-9_-]+$/.test(codeChallenge)
	);
}

function isValidDeviceName(deviceName: unknown): deviceName is string {
	return (
		typeof deviceName === "string" &&
		deviceName.trim().length > 0 &&
		deviceName.trim().length <= 128
	);
}

function isValidCliCode(code: unknown): code is string {
	return (
		typeof code === "string" &&
		code.length >= 20 &&
		code.length <= 128 &&
		/^[A-Za-z0-9-]+$/.test(code)
	);
}

function hashCodeVerifier(codeVerifier: string): string {
	return createHash("sha256").update(codeVerifier).digest("base64url");
}

const port = process.env.PORT ?? 4010;

const server = Bun.serve({
	port,
	async fetch(request) {
		const origin = request.headers.get("Origin");
		const cors = corsHeaders(origin);

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		const url = new URL(request.url);

		// Health check for Fly.io (must be GET-accessible)
		if (url.pathname === "/health") {
			return Response.json({ status: "ok", timestamp: Date.now() });
		}

		const requestId = crypto.randomUUID();
		const start = performance.now();

		return withContext(
			{ requestId, method: request.method, path: url.pathname },
			async () => {
				const response = await handleRequest(request, url, cors);
				const duration = Math.round(performance.now() - start);
				logger.info("{method} {path} {status} {duration}ms", {
					method: request.method,
					path: url.pathname,
					status: response.status,
					duration,
				});
				return response;
			},
		);
	},
});

async function handleRequest(
	request: Request,
	url: URL,
	cors: Record<string, string>,
): Promise<Response> {
	let rpcRequest = request;

	if (url.pathname === "/rpc/ingestSession") {
		try {
			rpcRequest = await cloneRequestWithBodyLimit(
				request,
				getIngestSecurityConfig(),
			);
		} catch (error) {
			if (error instanceof IngestRequestTooLargeError) {
				return jsonResponse(
					{
						error: "Ingest request exceeds the configured request size limit.",
					},
					cors,
					413,
				);
			}
			throw error;
		}
	}

	if (url.pathname === "/api/cli-token") {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, cors, 405);
		}

		const browserSession = await getAuthenticatedBrowserSession(request);
		if (!browserSession) {
			return jsonResponse({ error: "Not authenticated" }, cors, 401);
		}

		let body: {
			cliCallback?: unknown;
			state?: unknown;
			codeChallenge?: unknown;
			deviceName?: unknown;
		};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return jsonResponse({ error: "Invalid JSON body" }, cors, 400);
		}

		if (
			!isValidCliCallback(body.cliCallback) ||
			!isValidState(body.state) ||
			!isValidCodeChallenge(body.codeChallenge) ||
			!isValidDeviceName(body.deviceName)
		) {
			return jsonResponse({ error: "Invalid CLI auth request" }, cors, 400);
		}

		const code = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + CLI_AUTH_CODE_TTL_MS);
		const expiresAtIso = expiresAt.toISOString();
		const value: CliAuthCodeValue = {
			browserSessionId: browserSession.sessionId,
			userId: browserSession.userId,
			activeOrganizationId: browserSession.activeOrganizationId,
			state: body.state,
			codeChallenge: body.codeChallenge,
			deviceName: normalizeCliDeviceName(body.deviceName),
		};

		await pgClient`
			INSERT INTO verification (id, identifier, value, expires_at)
			VALUES (
				${crypto.randomUUID()},
				${`${CLI_AUTH_IDENTIFIER_PREFIX}${code}`},
				${JSON.stringify(value)},
				${expiresAtIso}
			)
		`;

		return jsonResponse(
			{ code, expiresAt: expiresAt.toISOString() },
			cors,
			200,
		);
	}

	if (url.pathname === "/api/cli-exchange") {
		if (request.method !== "POST") {
			return jsonResponse({ error: "Method not allowed" }, cors, 405);
		}

		let body: {
			code?: unknown;
			state?: unknown;
			codeVerifier?: unknown;
		};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return jsonResponse({ error: "Invalid JSON body" }, cors, 400);
		}

		if (
			!isValidCliCode(body.code) ||
			!isValidState(body.state) ||
			typeof body.codeVerifier !== "string" ||
			body.codeVerifier.length < 43 ||
			body.codeVerifier.length > 128
		) {
			return jsonResponse({ error: "Invalid CLI auth exchange" }, cors, 400);
		}

		const now = new Date().toISOString();
		const matches = await pgClient<{ id: string; value: string }[]>`
			SELECT id, value
			FROM verification
			WHERE identifier = ${`${CLI_AUTH_IDENTIFIER_PREFIX}${body.code}`}
				AND expires_at > ${now}
			LIMIT 1
		`;

		if (matches.length === 0) {
			return jsonResponse(
				{ error: "CLI auth code expired or invalid" },
				cors,
				400,
			);
		}

		const match = matches[0];
		if (!match) {
			return jsonResponse(
				{ error: "CLI auth code expired or invalid" },
				cors,
				400,
			);
		}

		await pgClient`
			DELETE FROM verification
			WHERE id = ${match.id}
		`;

		let stored: CliAuthCodeValue;
		try {
			stored = JSON.parse(match.value) as CliAuthCodeValue;
		} catch {
			return jsonResponse({ error: "CLI auth code is corrupted" }, cors, 400);
		}

		if (
			stored.state !== body.state ||
			stored.codeChallenge !== hashCodeVerifier(body.codeVerifier)
		) {
			return jsonResponse({ error: "CLI auth verification failed" }, cors, 400);
		}

		const sessionRows = await pgClient<{ id: string }[]>`
			SELECT id
			FROM "session"
			WHERE id = ${stored.browserSessionId}
				AND user_id = ${stored.userId}
				AND expires_at > ${now}
			LIMIT 1
		`;

		if (sessionRows.length === 0) {
			return jsonResponse({ error: "Session expired" }, cors, 401);
		}

		if (!sessionRows[0]) {
			return jsonResponse({ error: "Session expired" }, cors, 401);
		}

		const issued = await issueCliCredential({
			userId: stored.userId,
			activeOrganizationId: stored.activeOrganizationId,
			deviceName: stored.deviceName,
		});

		return jsonResponse(
			{
				token: issued.token,
				expiresAt: issued.expiresAt.toISOString(),
			},
			cors,
			200,
		);
	}

	if (url.pathname.startsWith("/api/auth")) {
		if (url.pathname.startsWith("/api/auth/organization/delete")) {
			return jsonResponse({ error: "Not found" }, cors, 404);
		}
		const response = await auth.handler(request);
		for (const [key, value] of Object.entries(cors)) {
			response.headers.set(key, value);
		}
		return response;
	}

	const { matched, response } = await rpcHandler.handle(rpcRequest, {
		prefix: "/rpc",
		context: await getContext(rpcRequest),
	});

	if (matched) {
		if (response.status >= 500) {
			const body = await response.clone().text();
			logger.error("RPC error on {path}: {status} {body}", {
				path: url.pathname,
				status: response.status,
				body,
			});
		}
		for (const [key, value] of Object.entries(cors)) {
			response.headers.set(key, value);
		}
		return response;
	}

	// Static file serving (production: frontend assets)
	const filePath = join(STATIC_DIR, url.pathname);
	const file = Bun.file(filePath);
	if (await file.exists()) {
		return new Response(file);
	}

	// SPA fallback: serve index.html for non-API routes
	const indexFile = Bun.file(join(STATIC_DIR, "index.html"));
	if (await indexFile.exists()) {
		return new Response(indexFile);
	}

	// Dev mode: redirect to frontend dev server for non-API routes
	// (e.g., after OAuth callback redirects to APP_URL which has no SPA)
	if (ALLOWED_ORIGIN !== appURL) {
		return Response.redirect(
			`${ALLOWED_ORIGIN}${url.pathname}${url.search}`,
			302,
		);
	}

	return new Response("Not found", { status: 404, headers: cors });
}

async function getContext(request: Request): Promise<AppContext> {
	const session = await auth.api.getSession({
		headers: request.headers,
	});
	if (session?.user && session.session.id) {
		return {
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				image: session.user.image ?? null,
			},
			session: {
				id: session.session.id,
				userId: session.user.id,
				activeOrganizationId:
					((session.session as Record<string, unknown>).activeOrganizationId as
						| string
						| null) ?? null,
				kind: "browser",
			},
		};
	}

	const authorization = request.headers.get("Authorization");
	if (!authorization?.startsWith("Bearer ")) {
		return { user: null, session: null };
	}

	const token = authorization.slice("Bearer ".length).trim();
	if (!token) {
		return { user: null, session: null };
	}

	const cliSession = await authenticateCliCredential(token);
	if (!cliSession) {
		return { user: null, session: null };
	}

	return {
		user: cliSession.user,
		session: {
			id: cliSession.id,
			userId: cliSession.userId,
			activeOrganizationId: cliSession.activeOrganizationId,
			kind: "cli",
		},
	};
}

logger.info("API server listening on http://localhost:{port}", {
	port: server.port,
});
