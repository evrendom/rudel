CREATE TABLE "cli_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"device_name" text NOT NULL,
	"active_organization_id" text,
	"last_used_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cli_credential_token_prefix_unique" UNIQUE("token_prefix"),
	CONSTRAINT "cli_credential_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "cli_credential" ADD CONSTRAINT "cli_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;