import { join } from "node:path";
import { getLogger, withContext } from "@logtape/logtape";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Session as AuthSession } from "./auth.js";
import { createAuth } from "./auth.js";
import { db, sqlClient } from "./db.js";
import { getResendConfigWarnings } from "./email.js";
import {
	handleAvatarGetRequest,
	handleAvatarUploadRequest,
} from "./handlers/avatar-http.js";
import { shutdownApiProductAnalytics } from "./lib/product-analytics.js";
import { setupLogging } from "./logging.js";
import type { ApiKeyAuthFailure } from "./middleware.js";
import { checkWrappedShareLookupRateLimit } from "./rate-limit.js";
import { router } from "./router.js";
import { getPublicWrappedShare } from "./services/wrapped-share.service.js";
import { renderWrappedShareCardPng } from "./services/wrapped-share-card-image.js";
import {
	buildWrappedSharePageMetadata,
	injectWrappedSharePageMetadata,
} from "./services/wrapped-share-page-metadata.js";

await setupLogging();

const logger = getLogger(["rudel", "api", "http"]);
type AuthUser = AuthSession["user"];
const port = process.env.PORT ?? "4010";
const DEFAULT_DEV_API_ORIGIN = `http://localhost:${port}`;
const DEFAULT_DEV_ORIGIN = "http://localhost:4011";
const DEFAULT_DEV_ORIGINS = [
	DEFAULT_DEV_ORIGIN,
	"http://127.0.0.1:4011",
	"http://localhost:4012",
	"http://127.0.0.1:4012",
	"http://localhost:4013",
	"http://127.0.0.1:4013",
	"http://localhost:4014",
	"http://127.0.0.1:4014",
	"http://localhost:4015",
	"http://127.0.0.1:4015",
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
const WRAPPED_PUBLIC_SHARE_ID_SEGMENT = "([A-Za-z0-9_-]+)";
const WRAPPED_PUBLIC_PATH_PATTERN = new RegExp(
	`^/wrapped/${WRAPPED_PUBLIC_SHARE_ID_SEGMENT}/?$`,
	"u",
);
const WRAPPED_SHARE_CARD_IMAGE_PATH_PATTERN = new RegExp(
	`^/wrapped/${WRAPPED_PUBLIC_SHARE_ID_SEGMENT}/x-card\\.png$`,
	"u",
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
				const response = await handleRequest(request, url, cors, requestId);
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
	requestId: string,
): Promise<Response> {
	const wrappedShareCardImageId = getWrappedShareCardImageId(url.pathname);
	if (wrappedShareCardImageId) {
		return handleWrappedShareCardImageRequest({
			cors,
			method: request.method,
			shareId: wrappedShareCardImageId,
		});
	}

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

	if (url.pathname.startsWith("/api/avatar/")) {
		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method Not Allowed", {
				headers: { ...cors, Allow: "GET, HEAD" },
				status: 405,
			});
		}
		return handleAvatarGetRequest({
			cors,
			ifNoneMatch: request.headers.get("If-None-Match"),
			method: request.method,
			pathname: url.pathname,
		});
	}

	if (url.pathname === "/api/profile/avatar") {
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", {
				headers: { ...cors, Allow: "POST" },
				status: 405,
			});
		}
		return handleAvatarUploadRequest({
			cors,
			getSession: (req) => auth.api.getSession({ headers: req.headers }),
			request,
			requestId,
		});
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
		const wrappedPublicShareId = getWrappedPublicShareId(url.pathname);
		if (wrappedPublicShareId) {
			return handleWrappedPublicPageRequest({
				cors,
				indexFile,
				method: request.method,
				publicOrigin: getPublicRequestOrigin(request, url),
				requestPathname: url.pathname,
				shareId: wrappedPublicShareId,
			});
		}

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

async function handleWrappedShareCardImageRequest(input: {
	cors: Record<string, string>;
	method: string;
	shareId: string;
}) {
	const { cors, method, shareId } = input;
	if (method !== "GET" && method !== "HEAD") {
		return new Response("Method not allowed", {
			headers: { ...cors, Allow: "GET, HEAD" },
			status: 405,
		});
	}

	try {
		checkWrappedShareLookupRateLimit(shareId);
		const share = await getPublicWrappedShare(shareId);

		if (!share) {
			return new Response("Not found", { headers: cors, status: 404 });
		}

		const image = renderWrappedShareCardPng(share.snapshot);
		const headers = {
			...cors,
			"Cache-Control": "public, max-age=300, s-maxage=86400",
			"Content-Length": image.byteLength.toString(),
			"Content-Type": "image/png",
		};

		return new Response(method === "HEAD" ? null : image, {
			headers,
			status: 200,
		});
	} catch (error) {
		if (isTooManyRequestsError(error)) {
			return new Response("Too many requests", {
				headers: cors,
				status: 429,
			});
		}

		logger.error("Failed to render wrapped share card image: {error}", {
			error: String(error),
		});
		return new Response("Could not render image", {
			headers: cors,
			status: 500,
		});
	}
}

async function handleWrappedPublicPageRequest(input: {
	cors: Record<string, string>;
	indexFile: Bun.BunFile;
	method: string;
	publicOrigin: string;
	requestPathname: string;
	shareId: string;
}) {
	const { cors, indexFile, method, publicOrigin, requestPathname, shareId } =
		input;

	if (method !== "GET" && method !== "HEAD") {
		return new Response("Method not allowed", {
			headers: { ...cors, Allow: "GET, HEAD" },
			status: 405,
		});
	}

	const indexHtml = await indexFile.text();

	try {
		checkWrappedShareLookupRateLimit(shareId);
		const share = await getPublicWrappedShare(shareId);

		if (!share) {
			return new Response(method === "HEAD" ? null : indexHtml, {
				headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
			});
		}

		const publicUrl = new URL(requestPathname, publicOrigin).toString();
		const imageUrl = new URL(
			`${requestPathname.replace(/\/$/u, "")}/x-card.png`,
			publicOrigin,
		).toString();
		const html = injectWrappedSharePageMetadata(
			indexHtml,
			buildWrappedSharePageMetadata({
				imageUrl,
				publicUrl,
				share,
			}),
		);

		return new Response(method === "HEAD" ? null : html, {
			headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
		});
	} catch (error) {
		logger.error("Failed to inject wrapped share metadata: {error}", {
			error: String(error),
		});
		return new Response(method === "HEAD" ? null : indexHtml, {
			headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
		});
	}
}

function getWrappedPublicShareId(pathname: string) {
	return getFirstPathMatch(pathname, WRAPPED_PUBLIC_PATH_PATTERN);
}

function getWrappedShareCardImageId(pathname: string) {
	return getFirstPathMatch(pathname, WRAPPED_SHARE_CARD_IMAGE_PATH_PATTERN);
}

function getFirstPathMatch(pathname: string, pattern: RegExp) {
	const match = pathname.match(pattern);
	const shareId = match?.[1];

	if (!shareId) {
		return null;
	}

	return shareId;
}

function getPublicRequestOrigin(request: Request, url: URL) {
	const forwardedProto = request.headers.get("x-forwarded-proto");
	const forwardedHost = request.headers.get("x-forwarded-host");
	const proto =
		forwardedProto?.split(",")[0]?.trim() || url.protocol.slice(0, -1);
	const host =
		forwardedHost?.split(",")[0]?.trim() ||
		request.headers.get("host") ||
		url.host;

	return `${proto}://${host}`;
}

function isTooManyRequestsError(error: unknown) {
	return error instanceof ORPCError && error.code === "TOO_MANY_REQUESTS";
}

async function getContext(request: Request) {
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	let apiKeyId: string | null = null;
	let authFailure: ApiKeyAuthFailure | null = null;
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
			} else {
				authFailure = getApiKeyAuthFailure(verification);
				logger.warn("API key verification failed: {code} {message}", {
					code: authFailure.code ?? "unknown",
					message: authFailure.message,
				});
			}
		} catch (error) {
			authFailure = getApiKeyAuthFailure(error);
			logger.warn("API key verification threw: {code} {message}", {
				code: authFailure.code ?? "unknown",
				message: authFailure.message,
			});
		}
	}

	return {
		user: session?.user ?? apiKeyUser ?? null,
		session: session?.session ?? null,
		apiKeyId,
		authFailure,
	};
}

function getApiKeyAuthFailure(input: unknown): ApiKeyAuthFailure {
	const error = getErrorRecord(input);
	const code = getStringProperty(error, "code");
	const message =
		getStringProperty(error, "message") ??
		(code === "RATE_LIMITED"
			? "API key rate limit exceeded"
			: "API key verification failed");

	return { code, message };
}

function getErrorRecord(input: unknown): Record<string, unknown> | null {
	if (isRecord(input) && isRecord(input.error)) {
		return input.error;
	}

	if (isRecord(input) && isRecord(input.body)) {
		return input.body;
	}

	return isRecord(input) ? input : null;
}

function getStringProperty(
	record: Record<string, unknown> | null,
	key: string,
) {
	const value = record?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

logger.info("API server listening on http://localhost:{port}", {
	port: server.port,
});
