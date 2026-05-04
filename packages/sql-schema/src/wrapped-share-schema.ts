import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.js";

// wrapped_share stores the public replay payload for the Saturday growth loop.
// The table is intentionally snapshot-based: we persist exactly what the public
// route should render so anonymous replay never has to reach back into private
// analytics tables or user-scoped queries.
export const wrappedShare = pgTable(
	"wrapped_share",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// payload_version lets us invalidate older persisted shapes cleanly if the
		// public share contract changes after launch.
		payloadVersion: integer("payload_version").notNull().default(1),
		snapshotJson: text("snapshot_json").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// variant lets a single user have both a normal public card and a Decimal
		// public card without one clobbering the other. Decimal writes are gated by
		// wrapped_decimal_claim entitlement at the service layer.
		variant: text("variant").notNull().default("normal"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
		// expires_at gives the public route an explicit end-of-life instead of
		// letting share links survive forever by accident.
		expiresAt: timestamp("expires_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
	},
	(table) => [
		uniqueIndex("wrapped_share_user_id_variant_unique").on(
			table.userId,
			table.variant,
		),
		check(
			"wrapped_share_variant_check",
			sql`${table.variant} IN ('normal', 'decimal')`,
		),
	],
);

export type WrappedShareSelect = typeof wrappedShare.$inferSelect;
export type WrappedShareInsert = typeof wrappedShare.$inferInsert;
