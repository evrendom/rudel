CREATE TABLE "session_ownership" (
	"organization_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_ownership_pkey" PRIMARY KEY("organization_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "session_ownership" ADD CONSTRAINT "session_ownership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ownership" ADD CONSTRAINT "session_ownership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
