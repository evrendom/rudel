import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.js";

export const wrappedShare = pgTable("wrapped_share", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	snapshotJson: text("snapshot_json").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.defaultNow()
		.notNull(),
});

export type WrappedShareSelect = typeof wrappedShare.$inferSelect;
export type WrappedShareInsert = typeof wrappedShare.$inferInsert;
