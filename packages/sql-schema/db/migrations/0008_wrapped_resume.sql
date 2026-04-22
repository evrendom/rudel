CREATE TABLE "wrapped_resume" (
	"token" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"share_id" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wrapped_resume" ADD CONSTRAINT "wrapped_resume_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;