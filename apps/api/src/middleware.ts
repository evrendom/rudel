import { implement, ORPCError } from "@orpc/server";
import { contract } from "@rudel/api-routes";
import { pgClient } from "./db.js";

export interface AuthenticatedUser {
	id: string;
	email: string;
	name: string;
	image: string | null;
}

export interface AppSession {
	id: string;
	userId: string;
	activeOrganizationId: string | null;
	kind: "browser" | "cli";
}

export interface AppContext {
	user: AuthenticatedUser | null;
	session: AppSession | null;
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
		},
	});
});

async function hasOrganizationMembership(
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const membership = await pgClient<{ id: string }[]>`
		SELECT id
		FROM member
		WHERE organization_id = ${organizationId}
			AND user_id = ${userId}
		LIMIT 1
	`;

	return membership.length > 0;
}

async function clearStaleActiveOrganization(
	currentSession: AppSession,
	organizationId: string,
): Promise<void> {
	if (currentSession.kind === "browser") {
		await pgClient`
			UPDATE "session"
			SET active_organization_id = NULL
			WHERE id = ${currentSession.id}
				AND active_organization_id = ${organizationId}
		`;
		return;
	}

	await pgClient`
		UPDATE cli_credential
		SET active_organization_id = NULL
		WHERE id = ${currentSession.id}
			AND active_organization_id = ${organizationId}
	`;
}

export async function resolveActiveOrganizationId(
	userId: string,
	currentSession: AppSession,
): Promise<string> {
	const activeOrganizationId = currentSession.activeOrganizationId;

	if (
		activeOrganizationId &&
		(await hasOrganizationMembership(userId, activeOrganizationId))
	) {
		return activeOrganizationId;
	}

	if (activeOrganizationId && currentSession.id.length > 0) {
		await clearStaleActiveOrganization(currentSession, activeOrganizationId);
	}

	if (await hasOrganizationMembership(userId, userId)) {
		return userId;
	}

	throw new ORPCError("FORBIDDEN", {
		message: "Not a member of the active organization",
	});
}

export const orgMiddleware = os.middleware(async ({ context, next }) => {
	if (!context.user || !context.session) {
		throw new ORPCError("UNAUTHORIZED");
	}
	const organizationId = await resolveActiveOrganizationId(
		context.user.id,
		context.session,
	);
	return next({
		context: {
			user: context.user,
			session: context.session,
			organizationId,
		},
	});
});
