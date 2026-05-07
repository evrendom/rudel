import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import {
	AVATAR_TRUSTED_OAUTH_HOSTS,
	AVATAR_URL_PATH_REGEX,
} from "@rudel/api-routes";
import type { Sql } from "postgres";
import { sqlClient } from "../db.js";
import {
	authMiddleware,
	os,
	settingsMutationMiddleware,
} from "../middleware.js";
import {
	deleteUserAvatarInTx,
	getUserAvatarOwnerByPublicId,
} from "../services/avatar-upload.service.js";
import { notifyAccountDeletion } from "../slack.js";

const logger = getLogger(["rudel", "api", "profile"]);

const updateMine = os.profile.updateMine
	.use(authMiddleware)
	.use(settingsMutationMiddleware)
	.handler(async ({ context, input }) => {
		const trimmedName = input.name.trim();
		const validatedImage = await validateProfileImage({
			image: input.image,
			userId: context.user.id,
		});

		await sqlClient.begin(async (rawTx) => {
			const tx = rawTx as unknown as Sql;
			const isOwnAvatarUrl =
				validatedImage !== null && AVATAR_URL_PATH_REGEX.test(validatedImage);

			if (!isOwnAvatarUrl) {
				await deleteUserAvatarInTx(tx, context.user.id);
			}

			await tx`
				UPDATE "user"
				SET name = ${trimmedName},
					image = ${validatedImage},
					updated_at = NOW()
				WHERE id = ${context.user.id}
			`;
		});

		const [row] = await sqlClient<
			Array<{ email: string; id: string; image: string | null; name: string }>
		>`
			SELECT id, email, name, image
			FROM "user"
			WHERE id = ${context.user.id}
			LIMIT 1
		`;

		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		const activeOrganizationId =
			((context.session as Record<string, unknown>).activeOrganizationId as
				| string
				| null) ?? null;

		return {
			id: row.id,
			email: row.email,
			name: row.name,
			image: row.image ?? null,
			activeOrganizationId,
		};
	});

export async function validateProfileImage(input: {
	image: string | null;
	userId: string;
}): Promise<string | null> {
	const { image, userId } = input;
	if (image === null) {
		return null;
	}

	if (AVATAR_URL_PATH_REGEX.test(image)) {
		const publicId = image.slice("/api/avatar/".length);
		const owner = await getUserAvatarOwnerByPublicId(publicId);
		if (!owner || owner.userId !== userId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Avatar URL does not belong to the caller",
			});
		}
		return image;
	}

	let parsed: URL;
	try {
		parsed = new URL(image);
	} catch {
		throw new ORPCError("BAD_REQUEST", { message: "Invalid image URL" });
	}

	if (parsed.protocol !== "https:") {
		throw new ORPCError("BAD_REQUEST", {
			message: "Image URL must be HTTPS",
		});
	}

	if (
		!(AVATAR_TRUSTED_OAUTH_HOSTS as readonly string[]).includes(parsed.host)
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Image URL host is not allowed",
		});
	}

	return parsed.toString();
}

export interface DeletedUserPostgresData {
	deletedOrganizationIds: string[];
}

export interface DeletedUser {
	email: string;
	id: string;
	name: string;
}

export async function getDeletedOrganizationIdsForUser(
	userId: string,
): Promise<string[]> {
	const orphanedOrgs = await sqlClient<Array<{ organizationId: string }>>`
		SELECT organization_id AS "organizationId"
		FROM member
		WHERE organization_id IN (
			SELECT organization_id
			FROM member
			WHERE user_id = ${userId}
		)
		GROUP BY organization_id
		HAVING COUNT(*) = 1
	`;

	return orphanedOrgs.map((org) => org.organizationId);
}

export async function deleteUserPostgresData(
	userId: string,
	deletedOrganizationIds?: readonly string[],
): Promise<DeletedUserPostgresData> {
	const orphanedOrgIds = deletedOrganizationIds
		? [...deletedOrganizationIds]
		: await getDeletedOrganizationIdsForUser(userId);

	await sqlClient.begin(async (rawTx) => {
		const tx = rawTx as unknown as Sql;

		await tx`DELETE FROM apikey WHERE reference_id = ${userId}`;

		if (orphanedOrgIds.length > 0) {
			await tx`DELETE FROM organization WHERE id = ANY(${orphanedOrgIds}::text[])`;
		}

		await tx`DELETE FROM "user" WHERE id = ${userId}`;
	});

	return { deletedOrganizationIds: orphanedOrgIds };
}

export async function deleteUserWithAccountDeletionNotification(input: {
	notify?: typeof notifyAccountDeletion;
	slackWebhookUrl: string | undefined;
	user: DeletedUser;
}): Promise<DeletedUserPostgresData> {
	const deletedOrganizationIds = await getDeletedOrganizationIdsForUser(
		input.user.id,
	);

	if (input.slackWebhookUrl) {
		await (input.notify ?? notifyAccountDeletion)(
			input.slackWebhookUrl,
			input.user,
			deletedOrganizationIds,
		);
	}

	return deleteUserPostgresData(input.user.id, deletedOrganizationIds);
}

const deleteMine = os.profile.deleteMine
	.use(authMiddleware)
	.use(settingsMutationMiddleware)
	.handler(async ({ context }) => {
		const userId = context.user.id;
		const userEmail = context.user.email;
		const userName = context.user.name;

		logger.info("User {userId} ({email}) self-deleting account", {
			userId,
			email: userEmail,
		});

		const { deletedOrganizationIds } =
			await deleteUserWithAccountDeletionNotification({
				slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
				user: { id: userId, name: userName, email: userEmail },
			});

		logger.info(
			"User {userId} self-delete completed; deletedOrganizationIds={deletedOrganizationIds}",
			{ userId, deletedOrganizationIds },
		);

		return { success: true as const };
	});

export const profileRouter = os.profile.router({
	updateMine,
	deleteMine,
});
