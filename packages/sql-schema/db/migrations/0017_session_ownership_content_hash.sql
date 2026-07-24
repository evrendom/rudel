ALTER TABLE "session_ownership"
	ADD COLUMN "last_content_sha256" text,
	ADD COLUMN "last_ingested_at" timestamp with time zone;
