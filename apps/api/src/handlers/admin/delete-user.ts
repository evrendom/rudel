import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { apikey, member, organization, user } from "@rudel/sql-schema";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "../../db.js";
import { adminMiddleware, os } from "../../middleware.js";

const logger = getLogger(["rudel", "api", "admin"]);

export const deleteUser = os.admin.deleteUser
	.use(adminMiddleware)
	.handler(async ({ input, context }) => {
		const { userId } = input;

		if (userId === context.user.id) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot delete your own account",
			});
		}

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

		await db.transaction(async (tx) => {
			// Find organizations where this user is the sole member
			const orphanedOrgs = await tx
				.select({ organizationId: member.organizationId })
				.from(member)
				.where(
					inArray(
						member.organizationId,
						tx
							.select({ organizationId: member.organizationId })
							.from(member)
							.where(eq(member.userId, userId)),
					),
				)
				.groupBy(member.organizationId)
				.having(eq(count(), 1));

			const orphanedOrgIds = orphanedOrgs.map((o) => o.organizationId);

			// Delete API keys (no FK cascade from user)
			await tx.delete(apikey).where(eq(apikey.referenceId, userId));

			// Delete orphaned organizations (cascades invitation + member rows for those orgs)
			if (orphanedOrgIds.length > 0) {
				await tx
					.delete(organization)
					.where(inArray(organization.id, orphanedOrgIds));
			}

			// Delete user (cascades session, account, member, invitation, deviceCode)
			await tx.delete(user).where(eq(user.id, userId));
		});

		logger.info("Successfully deleted user {userId}", { userId });

		return { success: true };
	});
