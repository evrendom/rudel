import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { user } from "@rudel/sql-schema";
import { count, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { adminMiddleware, os } from "../../middleware.js";

const logger = getLogger(["rudel", "api", "admin"]);

const listUsers = os.admin.listUsers
	.use(adminMiddleware)
	.handler(async ({ input }) => {
		const { search, limit, offset } = input;

		const where = search
			? or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
			: undefined;

		const [users, totalResult] = await Promise.all([
			db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
					createdAt: user.createdAt,
					organizationCount:
						sql<number>`(SELECT count(*) FROM member WHERE member.user_id = ${user.id})`.as(
							"organization_count",
						),
				})
				.from(user)
				.where(where)
				.orderBy(user.createdAt)
				.limit(limit)
				.offset(offset),
			db.select({ count: count() }).from(user).where(where),
		]);

		return {
			users: users.map((u) => ({
				id: u.id,
				name: u.name,
				email: u.email,
				image: u.image ?? null,
				createdAt: u.createdAt.toISOString(),
				organizationCount: Number(u.organizationCount),
			})),
			total: totalResult[0]?.count ?? 0,
		};
	});

const deleteUser = os.admin.deleteUser
	.use(adminMiddleware)
	.handler(async ({ input, context }) => {
		const { userId } = input;

		// Prevent self-deletion
		if (userId === context.user.id) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot delete your own account",
			});
		}

		// Verify the target user exists
		const [targetUser] = await db
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (!targetUser) {
			throw new ORPCError("NOT_FOUND", {
				message: "User not found",
			});
		}

		logger.info("Deleting user {userId} ({email}) by admin {adminId}", {
			userId,
			email: targetUser.email,
			adminId: context.user.id,
		});

		// TODO: Delete ClickHouse data for this user
		// ClickHouse deletes don't currently work reliably.
		// When implementing, delete from all adapter tables + session_analytics
		// where user_id = userId (across all organizations the user belongs to).
		// See deleteOrgSessions() in services/org-session.service.ts for reference.

		// TODO: Delete all user data from Postgres
		// The deletion must happen in the correct order to respect FK constraints,
		// or use a transaction. Steps:
		//
		// 1. Find all organizations where this user is the sole member
		//    SELECT organization_id FROM member
		//    WHERE organization_id IN (SELECT organization_id FROM member WHERE user_id = ?)
		//    GROUP BY organization_id HAVING count(*) = 1
		//
		// 2. Delete invitations sent by this user
		//    DELETE FROM invitation WHERE inviter_id = ?
		//
		// 3. Delete invitations for organizations that will be deleted (from step 1)
		//    DELETE FROM invitation WHERE organization_id IN (orphaned org ids)
		//
		// 4. Delete API keys owned by this user
		//    DELETE FROM apikey WHERE reference_id = ?
		//
		// 5. Delete device codes for this user
		//    DELETE FROM "deviceCode" WHERE user_id = ?
		//
		// 6. Delete verification tokens (if any are user-scoped)
		//
		// 7. Delete all memberships for this user
		//    DELETE FROM member WHERE user_id = ?
		//
		// 8. Delete orphaned organizations (from step 1) — no members remain
		//    DELETE FROM organization WHERE id IN (orphaned org ids)
		//
		// 9. Delete sessions for this user
		//    DELETE FROM session WHERE user_id = ?
		//
		// 10. Delete accounts (OAuth links) for this user
		//     DELETE FROM account WHERE user_id = ?
		//
		// 11. Delete the user record
		//     DELETE FROM "user" WHERE id = ?
		//
		// Note: Many of these cascade from the user delete (session, account, member,
		// deviceCode have ON DELETE CASCADE on user_id). But organizations and
		// invitations need explicit cleanup since they don't cascade from user deletion.

		throw new ORPCError("NOT_IMPLEMENTED", {
			message: "User deletion is not yet implemented. This is a placeholder.",
		});
	});

export const adminRouter = os.admin.router({
	listUsers,
	deleteUser,
});
