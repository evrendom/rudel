import { member, user } from "@rudel/sql-schema";
import { count, eq, ilike, or } from "drizzle-orm";
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
					organizationCount: count(member.id),
				})
				.from(user)
				.leftJoin(member, eq(member.userId, user.id))
				.where(where)
				.groupBy(user.id, user.name, user.email, user.image, user.createdAt)
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
				organizationCount: u.organizationCount,
			})),
			total: totalResult[0]?.count ?? 0,
		};
	});
