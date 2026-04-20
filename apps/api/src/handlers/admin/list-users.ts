import { sqlClient } from "../../db.js";
import { adminMiddleware, os } from "../../middleware.js";

interface AdminUserRow {
	createdAt: Date;
	email: string;
	id: string;
	image: string | null;
	name: string;
	organizationCount: number;
}

export const listUsers = os.admin.listUsers
	.use(adminMiddleware)
	.handler(async ({ input }) => {
		const { search, limit, offset } = input;
		const searchPattern = search ? `%${search}%` : null;

		const [users, totalResult] = await Promise.all([
			searchPattern
				? sqlClient.unsafe<Array<AdminUserRow>>(
						`
							SELECT
								u.id,
								u.name,
								u.email,
								u.image,
								u.created_at AS "createdAt",
								COUNT(m.id)::int AS "organizationCount"
							FROM "user" u
							LEFT JOIN member m ON m.user_id = u.id
							WHERE u.name ILIKE $1 OR u.email ILIKE $1
							GROUP BY u.id, u.name, u.email, u.image, u.created_at
							ORDER BY u.created_at
							LIMIT $2
							OFFSET $3
						`,
						[searchPattern, limit, offset],
					)
				: sqlClient.unsafe<Array<AdminUserRow>>(
						`
							SELECT
								u.id,
								u.name,
								u.email,
								u.image,
								u.created_at AS "createdAt",
								COUNT(m.id)::int AS "organizationCount"
							FROM "user" u
							LEFT JOIN member m ON m.user_id = u.id
							GROUP BY u.id, u.name, u.email, u.image, u.created_at
							ORDER BY u.created_at
							LIMIT $1
							OFFSET $2
						`,
						[limit, offset],
					),
			searchPattern
				? sqlClient.unsafe<Array<{ count: number }>>(
						`
							SELECT COUNT(*)::int AS count
							FROM "user" u
							WHERE u.name ILIKE $1 OR u.email ILIKE $1
						`,
						[searchPattern],
					)
				: sqlClient.unsafe<Array<{ count: number }>>(
						`SELECT COUNT(*)::int AS count FROM "user"`,
					),
		]);

		return {
			users: users.map((user) => ({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				createdAt: user.createdAt.toISOString(),
				organizationCount: user.organizationCount,
			})),
			total: totalResult[0]?.count ?? 0,
		};
	});
