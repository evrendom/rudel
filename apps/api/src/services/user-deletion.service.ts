import type postgres from "postgres";
import {
	enqueueClickHousePurge,
	wakeClickHousePurgeWorker,
} from "./clickhouse-purge.service.js";

export interface DeletedUserPostgresData {
	deletedOrganizationIds: string[];
}

interface DeleteUserPostgresDataEnv {
	sqlClient: postgres.Sql;
}

export async function deleteUserPostgresData(
	userId: string,
	env: DeleteUserPostgresDataEnv,
): Promise<DeletedUserPostgresData> {
	const deletedData = await env.sqlClient.begin(async (transaction) => {
		await transaction.unsafe(
			`
				SELECT id
				FROM "user"
				WHERE id = $1
				FOR UPDATE
			`,
			[userId],
		);
		await enqueueClickHousePurge(
			{ targetId: userId, targetType: "account" },
			transaction,
		);

		const candidateOrganizations = await transaction.unsafe<
			Array<{ id: string }>
		>(
			`
				SELECT organization.id
				FROM organization
				INNER JOIN member
					ON member.organization_id = organization.id
				WHERE member.user_id = $1
					AND NOT EXISTS (
						SELECT 1
						FROM member other_member
						WHERE other_member.organization_id = organization.id
							AND other_member.user_id <> $1
					)
				ORDER BY organization.id
			`,
			[userId],
		);
		const candidateOrganizationIds = candidateOrganizations.map(
			(organization) => organization.id,
		);

		let deletedOrganizations: Array<{ id: string }> = [];
		if (candidateOrganizationIds.length > 0) {
			await transaction.unsafe(
				`
					SELECT id
					FROM organization
					WHERE id = ANY($1::text[])
					ORDER BY id
					FOR UPDATE
				`,
				[candidateOrganizationIds],
			);

			deletedOrganizations = await transaction.unsafe<Array<{ id: string }>>(
				`
					DELETE FROM organization
					WHERE id = ANY($1::text[])
						AND NOT EXISTS (
							SELECT 1
							FROM member
							WHERE member.organization_id = organization.id
								AND member.user_id <> $2
						)
					RETURNING id
				`,
				[candidateOrganizationIds, userId],
			);
		}

		const deletedOrganizationIds = deletedOrganizations.map(
			(organization) => organization.id,
		);
		for (const organizationId of deletedOrganizationIds) {
			await enqueueClickHousePurge(
				{ targetId: organizationId, targetType: "organization" },
				transaction,
			);
		}

		await transaction.unsafe("DELETE FROM apikey WHERE reference_id = $1", [
			userId,
		]);

		if (deletedOrganizationIds.length > 0) {
			await transaction.unsafe(
				`
					UPDATE session
					SET active_organization_id = NULL
					WHERE active_organization_id = ANY($1::text[])
				`,
				[deletedOrganizationIds],
			);
		}

		await transaction.unsafe('DELETE FROM "user" WHERE id = $1', [userId]);

		return { deletedOrganizationIds };
	});
	wakeClickHousePurgeWorker();
	return deletedData;
}
