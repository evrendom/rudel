import { user } from "@rudel/sql-schema";
import { count, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { adminMiddleware, os } from "../../middleware.js";

export const listUsers = os.admin.listUsers
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
