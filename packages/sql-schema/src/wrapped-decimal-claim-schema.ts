import { sql } from "drizzle-orm";
import {
	customType,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

const bytea = customType<{ data: Uint8Array; default: false }>({
	dataType() {
		return "bytea";
	},
});

// wrapped_decimal_claim is the single source of Decimal entitlement for launch.
// A row exists for every issued claim link; only the sha256 hash of the raw
// token is persisted. A claimed row (claimed_by_user_id IS NOT NULL) doubles
// as the user's entitlement record — there is intentionally no separate
// entitlement table yet.
export const wrappedDecimalClaim = pgTable(
	"wrapped_decimal_claim",
	{
		tokenHash: bytea("token_hash").primaryKey(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
		claimedByUserId: text("claimed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
	},
	(table) => [
		// Partial unique index enforces "one claim per user" at the DB boundary.
		// The redeem handler still pre-checks entitlement so a second token stays
		// unclaimed — this index is defense-in-depth.
		uniqueIndex("wrapped_decimal_claim_user_unique")
			.on(table.claimedByUserId)
			.where(sql`${table.claimedByUserId} IS NOT NULL`),
	],
);

export type WrappedDecimalClaimSelect = typeof wrappedDecimalClaim.$inferSelect;
export type WrappedDecimalClaimInsert = typeof wrappedDecimalClaim.$inferInsert;
