CREATE TABLE "session_ownership_backfill_state" (
	"backfill_key" text PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
