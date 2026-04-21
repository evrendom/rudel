ALTER TABLE "wrapped_share" ADD COLUMN "payload_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "wrapped_share" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "wrapped_share"
SET "expires_at" = "created_at" + interval '30 days'
WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "wrapped_share" ALTER COLUMN "expires_at" SET NOT NULL;
