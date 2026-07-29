import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const clickhousePurgeJob = pgTable(
	"clickhouse_purge_job",
	{
		id: text("id").primaryKey(),
		targetType: text("target_type").notNull(),
		targetId: text("target_id").notNull(),
		status: text("status").default("pending").notNull(),
		attemptCount: integer("attempt_count").default(0).notNull(),
		maxAttempts: integer("max_attempts").notNull(),
		lastError: text("last_error"),
		nextAttemptAt: timestamp("next_attempt_at", {
			withTimezone: true,
			mode: "date",
		}).defaultNow(),
		lastAttemptAt: timestamp("last_attempt_at", {
			withTimezone: true,
			mode: "date",
		}),
		succeededAt: timestamp("succeeded_at", {
			withTimezone: true,
			mode: "date",
		}),
		failedAt: timestamp("failed_at", {
			withTimezone: true,
			mode: "date",
		}),
		alertStatus: text("alert_status").default("not_required").notNull(),
		alertAttemptCount: integer("alert_attempt_count").default(0).notNull(),
		alertLastError: text("alert_last_error"),
		alertNextAttemptAt: timestamp("alert_next_attempt_at", {
			withTimezone: true,
			mode: "date",
		}),
		alertSentAt: timestamp("alert_sent_at", {
			withTimezone: true,
			mode: "date",
		}),
		leaseToken: text("lease_token"),
		leaseExpiresAt: timestamp("lease_expires_at", {
			withTimezone: true,
			mode: "date",
		}),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "date",
		})
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "date",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("clickhouse_purge_job_target_unique").on(
			table.targetType,
			table.targetId,
		),
		index("clickhouse_purge_job_due_idx").on(table.status, table.nextAttemptAt),
		index("clickhouse_purge_job_alert_due_idx").on(
			table.alertStatus,
			table.alertNextAttemptAt,
		),
		check(
			"clickhouse_purge_job_target_type_check",
			sql`${table.targetType} IN ('account', 'organization')`,
		),
		check(
			"clickhouse_purge_job_status_check",
			sql`${table.status} IN ('pending', 'running', 'retrying', 'succeeded', 'failed')`,
		),
		check(
			"clickhouse_purge_job_alert_status_check",
			sql`${table.alertStatus} IN ('not_required', 'pending', 'sending', 'retrying', 'sent')`,
		),
		check(
			"clickhouse_purge_job_attempt_count_check",
			sql`${table.attemptCount} >= 0`,
		),
		check(
			"clickhouse_purge_job_max_attempts_check",
			sql`${table.maxAttempts} > 0`,
		),
		check(
			"clickhouse_purge_job_alert_attempt_count_check",
			sql`${table.alertAttemptCount} >= 0`,
		),
	],
);

export type ClickHousePurgeJobSelect = typeof clickhousePurgeJob.$inferSelect;
export type ClickHousePurgeJobInsert = typeof clickhousePurgeJob.$inferInsert;
