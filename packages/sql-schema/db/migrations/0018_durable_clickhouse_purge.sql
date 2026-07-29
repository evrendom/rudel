CREATE TABLE "clickhouse_purge_job" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now(),
	"last_attempt_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"alert_status" text DEFAULT 'not_required' NOT NULL,
	"alert_attempt_count" integer DEFAULT 0 NOT NULL,
	"alert_last_error" text,
	"alert_next_attempt_at" timestamp with time zone,
	"alert_sent_at" timestamp with time zone,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clickhouse_purge_job_target_type_check"
		CHECK ("target_type" IN ('account', 'organization')),
	CONSTRAINT "clickhouse_purge_job_status_check"
		CHECK ("status" IN ('pending', 'running', 'retrying', 'succeeded', 'failed')),
	CONSTRAINT "clickhouse_purge_job_alert_status_check"
		CHECK ("alert_status" IN ('not_required', 'pending', 'sending', 'retrying', 'sent')),
	CONSTRAINT "clickhouse_purge_job_attempt_count_check"
		CHECK ("attempt_count" >= 0),
	CONSTRAINT "clickhouse_purge_job_max_attempts_check"
		CHECK ("max_attempts" > 0),
	CONSTRAINT "clickhouse_purge_job_alert_attempt_count_check"
		CHECK ("alert_attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "clickhouse_purge_job_target_unique"
	ON "clickhouse_purge_job" USING btree ("target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "clickhouse_purge_job_due_idx"
	ON "clickhouse_purge_job" USING btree ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX "clickhouse_purge_job_alert_due_idx"
	ON "clickhouse_purge_job" USING btree ("alert_status", "alert_next_attempt_at");
