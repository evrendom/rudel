import { join } from "node:path";
import { getLogger, withContext } from "@logtape/logtape";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Session as AuthSession } from "./auth.js";
import { createAuth } from "./auth.js";
import { db, sqlClient } from "./db.js";
import { getResendConfigWarnings } from "./email.js";
import { shutdownApiProductAnalytics } from "./lib/product-analytics.js";
import { setupLogging } from "./logging.js";
import { router } from "./router.js";

await setupLogging();

const logger = getLogger(["rudel", "api", "http"]);
type AuthUser = AuthSession["user"];
const port = process.env.PORT ?? "4010";
const DEFAULT_DEV_API_ORIGIN = `http://localhost:${port}`;
const DEFAULT_DEV_ORIGIN = "http://localhost:4011";
const DEFAULT_DEV_ORIGINS = [
	DEFAULT_DEV_ORIGIN,
	"http://localhost:4012",
] as const;

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

const preferredFrontendOrigin =
	process.env.ALLOWED_ORIGIN ?? DEFAULT_DEV_ORIGIN;
const rawAppURL = process.env.APP_URL ?? DEFAULT_DEV_API_ORIGIN;
const appURL = resolveAuthAppURL({
	defaultDevApiOrigin: DEFAULT_DEV_API_ORIGIN,
	preferredFrontendOrigin,
	rawAppURL,
});
const configuredTrustedOrigins = process.env.TRUSTED_ORIGINS
	? process.env.TRUSTED_ORIGINS.split(",").map((o) => o.trim())
	: [];
const trustedOrigins = [
	...new Set([
		preferredFrontendOrigin,
		...configuredTrustedOrigins,
		...DEFAULT_DEV_ORIGINS,
	]),
];
const resend = {
	apiKey: process.env.RESEND_API_KEY,
	audienceId: process.env.RESEND_AUDIENCE_ID,
	fromEmail: process.env.RESEND_FROM_EMAIL,
};

if (appURL !== rawAppURL) {
	logger.warn(
		"Overriding APP_URL from {rawAppURL} to {appURL} because the frontend origin is local ({preferredFrontendOrigin})",
		{
			appURL,
			preferredFrontendOrigin,
			rawAppURL,
		},
	);
}

for (const warning of getResendConfigWarnings(resend)) {
	logger.warn(warning);
}

const auth = createAuth(db, {
	appURL,
	frontendURL: preferredFrontendOrigin,
	secret: process.env.BETTER_AUTH_SECRET,
	resend,
	socialProviders,
	trustedOrigins,
	cliDeviceVerificationUrl:
		process.env.CLI_DEVICE_VERIFICATION_URL ??
		`${preferredFrontendOrigin}/device`,
	slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
});

const rpcHandler = new RPCHandler(router, {
	interceptors: [
		onError((error) => {
			logger.error("RPC unhandled exception: {error} {stack}", {
				error: String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
		}),
	],
});

const STATIC_DIR = join(
	import.meta.dir,
	"..",
	process.env.STATIC_DIR ?? "public",
);

function corsHeaders(origin: string | null): Record<string, string> {
	if (!origin || !trustedOrigins.includes(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
	};
}

const MAX_REQUEST_BODY_BYTES = Number(
	process.env.MAX_REQUEST_BODY_BYTES ?? 500 * 1024 * 1024, // 500 MB
);

const server = Bun.serve({
	port,
	async fetch(request) {
		const origin = request.headers.get("Origin");
		const cors = corsHeaders(origin);

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		const contentLength = request.headers.get("Content-Length");
		if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
			return new Response(
				JSON.stringify({
					error: `Request body too large. Maximum size is ${Math.round(MAX_REQUEST_BODY_BYTES / (1024 * 1024))} MB.`,
				}),
				{
					status: 413,
					headers: { ...cors, "Content-Type": "application/json" },
				},
			);
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

function resolveAuthAppURL(input: {
	defaultDevApiOrigin: string;
	preferredFrontendOrigin: string;
	rawAppURL: string;
}) {
	const { defaultDevApiOrigin, preferredFrontendOrigin, rawAppURL } = input;

	if (!isLoopbackOrigin(preferredFrontendOrigin)) {
		return rawAppURL;
	}

	if (!isLoopbackOrigin(rawAppURL)) {
		return defaultDevApiOrigin;
	}

	if (sameOrigin(rawAppURL, preferredFrontendOrigin)) {
		return defaultDevApiOrigin;
	}

	return rawAppURL;
}

function isLoopbackOrigin(origin: string) {
	try {
		const url = new URL(origin);
		return url.hostname === "localhost" || url.hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

function sameOrigin(left: string, right: string) {
	try {
		const leftUrl = new URL(left);
		const rightUrl = new URL(right);
		return leftUrl.origin === rightUrl.origin;
	} catch {
		return false;
	}
}

let isShuttingDown = false;

async function shutdown(signal?: string) {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;

	await shutdownApiProductAnalytics();

	if (signal) {
		server.stop(true);
		process.exit(0);
	}
}

process.on("beforeExit", () => {
	void shutdown();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void shutdown(signal);
	});
}

async function handleRequest(
	request: Request,
	url: URL,
	cors: Record<string, string>,
): Promise<Response> {
	// Defense in depth: block Better Auth's built-in org deletion route.
	// Rudel has its own guarded deletion path via the RPC router.
	if (url.pathname === "/api/auth/organization/delete") {
		return new Response("Not Found", { status: 404, headers: cors });
	}
	if (url.pathname.startsWith("/api/auth")) {
		const response = await auth.handler(request);
		for (const [key, value] of Object.entries(cors)) {
			response.headers.set(key, value);
		}
		return response;
	}

	const { matched, response } = await rpcHandler.handle(request, {
		prefix: "/rpc",
		context: await getContext(request),
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
	if (preferredFrontendOrigin !== appURL) {
		return Response.redirect(
			`${preferredFrontendOrigin}${url.pathname}${url.search}`,
			302,
		);
	}

	return new Response("Not found", { status: 404, headers: cors });
}

async function getContext(request: Request) {
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	let apiKeyId: string | null = null;
	const apiKey =
		request.headers.get("x-api-key") ??
		request.headers.get("X-API-Key") ??
		null;

	let apiKeyUser: AuthUser | null = null;
	if (apiKey) {
		try {
			const verification = await auth.api.verifyApiKey({
				body: {
					key: apiKey,
					permissions: { ingest: ["write"] },
				},
			});

			if (verification.valid && verification.key) {
				const [foundUser] = await sqlClient<
					Array<{
						createdAt: Date;
						email: string;
						emailVerified: boolean;
						id: string;
						image: string | null;
						name: string;
						updatedAt: Date;
					}>
				>`
					SELECT
						id,
						name,
						email,
						email_verified AS "emailVerified",
						image,
						created_at AS "createdAt",
						updated_at AS "updatedAt"
					FROM "user"
					WHERE id = ${verification.key.referenceId}
					LIMIT 1
				`;

				if (foundUser) {
					apiKeyUser = {
						id: foundUser.id,
						name: foundUser.name,
						email: foundUser.email,
						emailVerified: foundUser.emailVerified,
						image: foundUser.image,
						createdAt: foundUser.createdAt,
						updatedAt: foundUser.updatedAt,
					} satisfies AuthUser;
					apiKeyId = verification.key.id;
				}
			}
		} catch {
			// Invalid API key is treated as unauthenticated for key-based auth.
		}
	}

	return {
		user: session?.user ?? apiKeyUser ?? null,
		session: session?.session ?? null,
		apiKeyId,
	};
}

logger.info("API server listening on http://localhost:{port}", {
	port: server.port,
});
