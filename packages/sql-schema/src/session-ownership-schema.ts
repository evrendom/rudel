import {
	index,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.js";

export const sessionOwnership = pgTable(
	"session_ownership",
	{
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		sessionId: text("session_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.organizationId, table.sessionId],
			name: "session_ownership_pkey",
		}),
		index("session_ownership_user_id_idx").on(table.userId),
	],
);

export const sessionOwnershipBackfillState = pgTable(
	"session_ownership_backfill_state",
	{
		backfillKey: text("backfill_key").primaryKey(),
		completedAt: timestamp("completed_at", {
			withTimezone: true,
			mode: "date",
		})
			.defaultNow()
			.notNull(),
	},
);

export type SessionOwnershipSelect = typeof sessionOwnership.$inferSelect;
export type SessionOwnershipInsert = typeof sessionOwnership.$inferInsert;
export type SessionOwnershipBackfillStateSelect =
	typeof sessionOwnershipBackfillState.$inferSelect;
export type SessionOwnershipBackfillStateInsert =
	typeof sessionOwnershipBackfillState.$inferInsert;
