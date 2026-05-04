CREATE TABLE "wrapped_decimal_claim" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by_user_id" text,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "wrapped_share_user_id_unique";--> statement-breakpoint
ALTER TABLE "wrapped_share" ADD COLUMN "variant" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "wrapped_decimal_claim" ADD CONSTRAINT "wrapped_decimal_claim_claimed_by_user_id_user_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wrapped_decimal_claim_user_unique" ON "wrapped_decimal_claim" USING btree ("claimed_by_user_id") WHERE "wrapped_decimal_claim"."claimed_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wrapped_share_user_id_variant_unique" ON "wrapped_share" USING btree ("user_id","variant");--> statement-breakpoint
ALTER TABLE "wrapped_share" ADD CONSTRAINT "wrapped_share_variant_check" CHECK ("wrapped_share"."variant" IN ('normal', 'decimal'));