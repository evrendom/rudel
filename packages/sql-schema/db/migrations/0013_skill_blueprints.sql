CREATE TABLE "linked_github_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"github_user_id" text NOT NULL,
	"github_login" text NOT NULL,
	"primary_email" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"repo_key" jsonb NOT NULL,
	"repo_key_hash" text NOT NULL,
	"first_seen_by_user_id" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_blueprint" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"current_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_blueprint_version" (
	"id" text PRIMARY KEY NOT NULL,
	"blueprint_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"version" text NOT NULL,
	"state" text NOT NULL,
	"payload" jsonb NOT NULL,
	"modules" jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repo_overlay" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"repo_key" jsonb NOT NULL,
	"repo_key_hash" text NOT NULL,
	"blueprint_id" text NOT NULL,
	"overlay" jsonb NOT NULL,
	"overlay_hash" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_install_report" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reported_by_user_id" text NOT NULL,
	"blueprint_id" text NOT NULL,
	"blueprint_version_id" text NOT NULL,
	"repo_key" jsonb NOT NULL,
	"repo_key_hash" text NOT NULL,
	"artifact_target" text NOT NULL,
	"target_path" text NOT NULL,
	"status" text NOT NULL,
	"generated_hash" text NOT NULL,
	"current_file_hash" text,
	"overlay_hash" text NOT NULL,
	"schema_version" text NOT NULL,
	"compiler_version" text NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linked_github_account" ADD CONSTRAINT "linked_github_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_registry" ADD CONSTRAINT "repo_registry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_registry" ADD CONSTRAINT "repo_registry_first_seen_by_user_id_user_id_fk" FOREIGN KEY ("first_seen_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_blueprint" ADD CONSTRAINT "skill_blueprint_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_blueprint_version" ADD CONSTRAINT "skill_blueprint_version_blueprint_id_skill_blueprint_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."skill_blueprint"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_blueprint_version" ADD CONSTRAINT "skill_blueprint_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_blueprint_version" ADD CONSTRAINT "skill_blueprint_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_overlay" ADD CONSTRAINT "repo_overlay_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_overlay" ADD CONSTRAINT "repo_overlay_blueprint_id_skill_blueprint_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."skill_blueprint"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "repo_overlay" ADD CONSTRAINT "repo_overlay_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_install_report" ADD CONSTRAINT "skill_install_report_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_install_report" ADD CONSTRAINT "skill_install_report_reported_by_user_id_user_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_install_report" ADD CONSTRAINT "skill_install_report_blueprint_id_skill_blueprint_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."skill_blueprint"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "linked_github_account_user_unique" ON "linked_github_account" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "linked_github_account_github_user_unique" ON "linked_github_account" USING btree ("github_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_registry_org_repo_unique" ON "repo_registry" USING btree ("organization_id","repo_key_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_blueprint_org_slug_unique" ON "skill_blueprint" USING btree ("organization_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_overlay_org_repo_blueprint_unique" ON "repo_overlay" USING btree ("organization_id","repo_key_hash","blueprint_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "skill_install_report_org_repo_blueprint_target_unique" ON "skill_install_report" USING btree ("organization_id","repo_key_hash","blueprint_id","artifact_target","target_path");
