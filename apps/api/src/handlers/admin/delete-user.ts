import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { sqlClient } from "../../db.js";
import { adminMiddleware, os } from "../../middleware.js";
import { deleteUserSessions } from "../../services/org-session.service.js";

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

		const [targetUser] = await sqlClient<Array<{ email: string; id: string }>>`
			SELECT id, email
			FROM "user"
			WHERE id = ${userId}
			LIMIT 1
		`;

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

		await deleteUserSessions(userId);

		await sqlClient.begin(async (sql) => {
			// Find organizations where this user is the sole member
			const orphanedOrgs = await sql.unsafe<Array<{ organizationId: string }>>(
				`
					SELECT organization_id AS "organizationId"
					FROM member
					WHERE organization_id IN (
						SELECT organization_id
						FROM member
						WHERE user_id = $1
					)
					GROUP BY organization_id
					HAVING COUNT(*) = 1
				`,
				[userId],
			);

			const orphanedOrgIds = orphanedOrgs.map((org) => org.organizationId);

			// Delete API keys (no FK cascade from user)
			await sql.unsafe(`DELETE FROM apikey WHERE reference_id = $1`, [userId]);

			// Delete orphaned organizations (cascades invitation + member rows for those orgs)
			if (orphanedOrgIds.length > 0) {
				await sql.unsafe(
					`DELETE FROM organization WHERE id = ANY($1::text[])`,
					[orphanedOrgIds],
				);
			}

			// Delete user (cascades session, account, member, invitation, deviceCode)
			await sql.unsafe(`DELETE FROM "user" WHERE id = $1`, [userId]);
		});

		logger.info("Successfully deleted user {userId}", { userId });

		return { success: true };
	});
