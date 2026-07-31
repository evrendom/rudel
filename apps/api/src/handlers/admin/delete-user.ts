import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { sqlClient } from "../../db.js";
import { adminMiddleware, os } from "../../middleware.js";
import { deleteUserPostgresData } from "../../services/user-deletion.service.js";

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

		const { deletedOrganizationIds } = await deleteUserPostgresData(userId, {
			sqlClient,
		});

		logger.info(
			"User {userId} deletion committed; ClickHouse purge queued; deletedOrganizationIds={deletedOrganizationIds}",
			{ deletedOrganizationIds, userId },
		);

		return { success: true };
	});
