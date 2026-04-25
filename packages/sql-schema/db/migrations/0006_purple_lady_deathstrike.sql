CREATE TABLE "wrapped_share" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"snapshot_json" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wrapped_share" ADD CONSTRAINT "wrapped_share_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrapped_share" ADD CONSTRAINT "wrapped_share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;