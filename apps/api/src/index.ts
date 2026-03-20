import { join } from "node:path";
import { getLogger, withContext } from "@logtape/logtape";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import {
	invitation as invitationTable,
	member as memberTable,
	user as userTable,
} from "@rudel/sql-schema";
import { and, eq } from "drizzle-orm";
import type { Session as AuthSession } from "./auth.js";
import { createAuth } from "./auth.js";
import { db } from "./db.js";
import { getResendConfigWarnings } from "./email.js";
import { shutdownApiProductAnalytics } from "./lib/product-analytics.js";
import { setupLogging } from "./logging.js";
import {
	getAdminAccessBlockMessage,
	isAdminAccessPath,
	isOwnerRole,
	ORGANIZATION_AUTH_PATHS,
} from "./organization-role-policy.js";
import { router } from "./router.js";

await setupLogging();

const logger = getLogger(["rudel", "api", "http"]);
type AuthUser = AuthSession["user"];

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
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:4011";
const trustedOrigins = process.env.TRUSTED_ORIGINS
	? process.env.TRUSTED_ORIGINS.split(",").map((o) => o.trim())
	: [ALLOWED_ORIGIN];
const resend = {
	apiKey: process.env.RESEND_API_KEY,
	audienceId: process.env.RESEND_AUDIENCE_ID,
	fromEmail: process.env.RESEND_FROM_EMAIL,
};

for (const warning of getResendConfigWarnings(resend)) {
	logger.warn(warning);
}

const auth = createAuth(db, {
	appURL,
	frontendURL: ALLOWED_ORIGIN,
	secret: process.env.BETTER_AUTH_SECRET,
	resend,
	socialProviders,
	trustedOrigins,
	cliDeviceVerificationUrl:
		process.env.CLI_DEVICE_VERIFICATION_URL ?? `${ALLOWED_ORIGIN}/device`,
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
	if (origin !== ALLOWED_ORIGIN) return {};
	return {
		"Access-Control-Allow-Origin": ALLOWED_ORIGIN,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
	};
}

const port = process.env.PORT ?? 4010;
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

	const rolePolicyResponse = await blockUnauthorizedAdminAssignment(
		request,
		url.pathname,
		cors,
	);
	if (rolePolicyResponse) {
		return rolePolicyResponse;
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
	if (ALLOWED_ORIGIN !== appURL) {
		return Response.redirect(
			`${ALLOWED_ORIGIN}${url.pathname}${url.search}`,
			302,
		);
	}

	return new Response("Not found", { status: 404, headers: cors });
}

async function blockUnauthorizedAdminAssignment(
	request: Request,
	pathname: string,
	cors: Record<string, string>,
) {
	if (!isAdminAccessPath(pathname)) {
		return null;
	}

	const body = await readJsonBody(request);
	if (!body) {
		return null;
	}

	const session = await auth.api.getSession({
		headers: request.headers,
	});
	if (!session) {
		return null;
	}

	const organizationId =
		getOrganizationIdFromBody(body) ?? session.session.activeOrganizationId;
	if (!organizationId) {
		return null;
	}

	const [actorMembership] = await db
		.select({ role: memberTable.role })
		.from(memberTable)
		.where(
			and(
				eq(memberTable.organizationId, organizationId),
				eq(memberTable.userId, session.user.id),
			),
		)
		.limit(1);

	const actorRole = actorMembership?.role ?? null;
	if (isOwnerRole(actorRole)) {
		return null;
	}

	const targetMemberRole = await getTargetMemberRole(
		pathname,
		body,
		organizationId,
	);
	const targetInvitationRole = await getTargetInvitationRole(
		pathname,
		body,
		organizationId,
	);

	const blockMessage = getAdminAccessBlockMessage({
		pathname,
		actorRole,
		requestedRole: body.role,
		targetMemberRole,
		targetInvitationRole,
	});

	if (!blockMessage) {
		return null;
	}

	return Response.json(
		{
			code: "FORBIDDEN",
			message: blockMessage,
		},
		{
			status: 403,
			headers: cors,
		},
	);
}

function getOrganizationIdFromBody(body: Record<string, unknown>) {
	return typeof body.organizationId === "string" ? body.organizationId : null;
}

async function getTargetMemberRole(
	pathname: string,
	body: Record<string, unknown>,
	organizationId: string,
) {
	switch (pathname) {
		case ORGANIZATION_AUTH_PATHS.updateMemberRole:
			return getMemberRoleById(body.memberId, organizationId);
		case ORGANIZATION_AUTH_PATHS.removeMember:
			return getMemberRoleByIdOrEmail(body.memberIdOrEmail, organizationId);
		default:
			return null;
	}
}

async function getTargetInvitationRole(
	pathname: string,
	body: Record<string, unknown>,
	organizationId: string,
) {
	if (pathname !== ORGANIZATION_AUTH_PATHS.cancelInvitation) {
		return null;
	}

	if (typeof body.invitationId !== "string") {
		return null;
	}

	const [invitation] = await db
		.select({ role: invitationTable.role })
		.from(invitationTable)
		.where(
			and(
				eq(invitationTable.id, body.invitationId),
				eq(invitationTable.organizationId, organizationId),
			),
		)
		.limit(1);

	return invitation?.role ?? null;
}

async function getMemberRoleById(memberId: unknown, organizationId: string) {
	if (typeof memberId !== "string") {
		return null;
	}

	const [member] = await db
		.select({ role: memberTable.role })
		.from(memberTable)
		.where(
			and(
				eq(memberTable.id, memberId),
				eq(memberTable.organizationId, organizationId),
			),
		)
		.limit(1);

	return member?.role ?? null;
}

async function getMemberRoleByIdOrEmail(
	memberIdOrEmail: unknown,
	organizationId: string,
) {
	if (typeof memberIdOrEmail !== "string") {
		return null;
	}

	if (memberIdOrEmail.includes("@")) {
		return getMemberRoleByEmail(memberIdOrEmail, organizationId);
	}

	return getMemberRoleById(memberIdOrEmail, organizationId);
}

async function getMemberRoleByEmail(email: string, organizationId: string) {
	const [member] = await db
		.select({ role: memberTable.role })
		.from(memberTable)
		.innerJoin(userTable, eq(memberTable.userId, userTable.id))
		.where(
			and(
				eq(memberTable.organizationId, organizationId),
				eq(userTable.email, email),
			),
		)
		.limit(1);

	return member?.role ?? null;
}

async function readJsonBody(request: Request) {
	try {
		const body = await request.clone().json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return null;
		}

		return body as Record<string, unknown>;
	} catch {
		return null;
	}
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
				const [foundUser] = await db
					.select({
						id: userTable.id,
						name: userTable.name,
						email: userTable.email,
						emailVerified: userTable.emailVerified,
						image: userTable.image,
						createdAt: userTable.createdAt,
						updatedAt: userTable.updatedAt,
					})
					.from(userTable)
					.where(eq(userTable.id, verification.key.referenceId))
					.limit(1);

				if (foundUser) {
					apiKeyUser = foundUser as AuthUser;
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
