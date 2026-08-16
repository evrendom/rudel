ALTER TABLE "session_ownership"
	ADD COLUMN "usage_extraction_generation" bigint DEFAULT 0 NOT NULL,
	ADD COLUMN "last_usage_content_sha256" text,
	ADD COLUMN "last_usage_extraction_version" integer,
	ADD COLUMN "last_usage_model_rate_card_version" text,
	ADD COLUMN "last_usage_event_count" integer,
	ADD COLUMN "last_usage_checksum" text,
	ADD COLUMN "last_usage_diagnostics_json" text,
	ADD COLUMN "last_usage_completed_generation" bigint,
	ADD COLUMN "last_usage_completed_at" timestamp with time zone;
