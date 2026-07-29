import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.js";

export const teamInviteLink = pgTable(
	"team_invite_link",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		creatorId: text("creator_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
		expiresAt: timestamp("expires_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		revokedAt: timestamp("revoked_at", {
			withTimezone: true,
			mode: "date",
		}),
	},
	(table) => [
		index("team_invite_link_organization_id_idx").on(table.organizationId),
		uniqueIndex("team_invite_link_token_hash_unique").on(table.tokenHash),
		uniqueIndex("team_invite_link_active_organization_unique")
			.on(table.organizationId)
			.where(sql`${table.revokedAt} IS NULL`),
	],
);

export type TeamInviteLinkSelect = typeof teamInviteLink.$inferSelect;
export type TeamInviteLinkInsert = typeof teamInviteLink.$inferInsert;
