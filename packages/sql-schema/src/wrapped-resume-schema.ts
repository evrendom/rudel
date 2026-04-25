import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

// wrapped_resume stores the temporary cross-device handoff token for users who
// sign in on mobile but need to continue setup on desktop. It is intentionally
// tiny and single-purpose so the product flow stays easy to audit.
export const wrappedResume = pgTable("wrapped_resume", {
	token: text("token").primaryKey(),
	email: text("email").notNull(),
	shareId: text("share_id"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.defaultNow()
		.notNull(),
	expiresAt: timestamp("expires_at", {
		withTimezone: true,
		mode: "date",
	}).notNull(),
	usedAt: timestamp("used_at", {
		withTimezone: true,
		mode: "date",
	}),
});

export type WrappedResumeSelect = typeof wrappedResume.$inferSelect;
export type WrappedResumeInsert = typeof wrappedResume.$inferInsert;
