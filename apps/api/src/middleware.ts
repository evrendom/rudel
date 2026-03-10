import { implement, ORPCError } from "@orpc/server";
import { contract } from "@rudel/api-routes";
import { member, session as sessionTable } from "@rudel/sql-schema";
import { and, eq } from "drizzle-orm";
import type { Session } from "./auth.js";
import { db } from "./db.js";

export interface AppContext {
	user: Session["user"] | null;
	session: Session["session"] | null;
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
	const membership = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
		)
		.limit(1);

	return membership.length > 0;
}

async function clearStaleActiveOrganization(
	sessionId: string,
	organizationId: string,
): Promise<void> {
	await db
		.update(sessionTable)
		.set({ activeOrganizationId: null })
		.where(
			and(
				eq(sessionTable.id, sessionId),
				eq(sessionTable.activeOrganizationId, organizationId),
			),
		);
}

export async function resolveActiveOrganizationId(
	userId: string,
	currentSession: Session["session"],
): Promise<string> {
	const activeOrganizationId =
		((currentSession as Record<string, unknown>).activeOrganizationId as
			| string
			| null) ?? null;

	if (
		activeOrganizationId &&
		(await hasOrganizationMembership(userId, activeOrganizationId))
	) {
		return activeOrganizationId;
	}

	if (
		activeOrganizationId &&
		typeof currentSession.id === "string" &&
		currentSession.id.length > 0
	) {
		await clearStaleActiveOrganization(currentSession.id, activeOrganizationId);
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
