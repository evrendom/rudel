import { implement, ORPCError } from "@orpc/server";
import { contract } from "@rudel/api-routes";
import type { Session } from "./auth.js";
import { sqlClient } from "./db.js";
import { checkAnalyticsRateLimit } from "./rate-limit.js";

export interface AppContext {
	user: Session["user"] | null;
	session: Session["session"] | null;
	apiKeyId: string | null;
	authFailure: ApiKeyAuthFailure | null;
}

export interface ApiKeyAuthFailure {
	code: string | null;
	message: string;
}

export const os = implement(contract).$context<AppContext>();

export const authMiddleware = os.middleware(async ({ context, next }) => {
	if (!context.user || !context.session) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			user: context.user,
			session: context.session,
			apiKeyId: context.apiKeyId,
			authFailure: context.authFailure,
		},
	});
});

export const orgMiddleware = os.middleware(async ({ context, next }) => {
	if (!context.user || !context.session) {
		throw new ORPCError("UNAUTHORIZED");
	}

	checkAnalyticsRateLimit(context.user.id);
	const organizationId =
		(context.session as Record<string, unknown>).activeOrganizationId ??
		context.user.id;
	if (!organizationId || typeof organizationId !== "string") {
		throw new ORPCError("BAD_REQUEST", {
			message: "No active organization",
		});
	}

	const membership = await sqlClient<Array<{ id: string; role: string }>>`
		SELECT id, role
		FROM member
		WHERE organization_id = ${organizationId}
			AND user_id = ${context.user.id}
		LIMIT 1
	`;

	const row = membership[0];
	if (!row) {
		throw new ORPCError("FORBIDDEN", {
			message: "Not a member of the active organization",
		});
	}

	const userRole = (row.role as "owner" | "admin" | "member") ?? "member";
	const isOrgAdmin = userRole === "owner" || userRole === "admin";

	return next({
		context: {
			user: context.user,
			session: context.session,
			apiKeyId: context.apiKeyId,
			organizationId,
			userRole,
			isOrgAdmin,
			authFailure: context.authFailure,
		},
	});
});

const ADMIN_ORGANIZATION_ID = process.env.VITE_ADMIN_ORGANIZATION_ID;

export const adminMiddleware = os.middleware(async ({ context, next }) => {
	if (!context.user || !context.session) {
		throw new ORPCError("UNAUTHORIZED");
	}

	if (!ADMIN_ORGANIZATION_ID) {
		throw new ORPCError("FORBIDDEN", {
			message: "Admin panel is not configured",
		});
	}

	const membership = await sqlClient<Array<{ id: string }>>`
		SELECT id
		FROM member
		WHERE organization_id = ${ADMIN_ORGANIZATION_ID}
			AND user_id = ${context.user.id}
		LIMIT 1
	`;

	if (membership.length === 0) {
		throw new ORPCError("FORBIDDEN", {
			message: "Admin access required",
		});
	}

	return next({
		context: {
			user: context.user,
			session: context.session,
			apiKeyId: context.apiKeyId,
			authFailure: context.authFailure,
		},
	});
});

export const ingestAuthMiddleware = os.middleware(async ({ context, next }) => {
	if (!context.user) {
		if (context.authFailure?.code === "RATE_LIMITED") {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message:
					"API key rate limit exceeded. Log in again to create a fresh ingest key or wait for the key's rate-limit window to reset.",
				data: {
					reason: "api_key_rate_limited",
					code: context.authFailure.code,
					authMessage: context.authFailure.message,
				},
			});
		}

		if (context.authFailure) {
			throw new ORPCError("UNAUTHORIZED", {
				message: context.authFailure.message,
				data: {
					reason: "api_key_verification_failed",
					code: context.authFailure.code,
				},
			});
		}

		throw new ORPCError("UNAUTHORIZED");
	}

	if (!context.session && !context.apiKeyId) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return next({
		context: {
			user: context.user,
			session: context.session,
			apiKeyId: context.apiKeyId,
			authFailure: context.authFailure,
		},
	});
});
