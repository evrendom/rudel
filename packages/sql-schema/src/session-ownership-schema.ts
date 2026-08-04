import {
	bigint,
	index,
	integer,
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
		lastContentSha256: text("last_content_sha256"),
		lastContentBytes: integer("last_content_bytes"),
		lastAssistantLineCount: integer("last_assistant_line_count"),
		lastContentShapeJson: text("last_content_shape_json"),
		lastFilterVersion: integer("last_filter_version"),
		lastSessionDate: timestamp("last_session_date", {
			withTimezone: true,
			mode: "date",
		}),
		lastIngestedAt: timestamp("last_ingested_at", {
			withTimezone: true,
			mode: "date",
		}),
		usageExtractionGeneration: bigint("usage_extraction_generation", {
			mode: "number",
		})
			.default(0)
			.notNull(),
		lastUsageContentSha256: text("last_usage_content_sha256"),
		lastUsageExtractionVersion: integer("last_usage_extraction_version"),
		lastUsageEventIdentityVersion: integer("last_usage_event_identity_version"),
		lastUsageModelRateCardVersion: text("last_usage_model_rate_card_version"),
		lastUsageEventCount: integer("last_usage_event_count"),
		lastUsageChecksum: text("last_usage_checksum"),
		lastUsageDiagnosticsJson: text("last_usage_diagnostics_json"),
		lastUsageCompletedGeneration: bigint("last_usage_completed_generation", {
			mode: "number",
		}),
		lastUsageCompletedAt: timestamp("last_usage_completed_at", {
			withTimezone: true,
			mode: "date",
		}),
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
