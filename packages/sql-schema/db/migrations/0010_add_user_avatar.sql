CREATE TABLE "user_avatar" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"content_type" text NOT NULL,
	"image_hash" text NOT NULL,
	"image_data" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_avatar_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "user_avatar" ADD CONSTRAINT "user_avatar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
