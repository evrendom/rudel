CREATE TABLE "team_invite_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);

ALTER TABLE "team_invite_link"
	ADD CONSTRAINT "team_invite_link_organization_id_organization_id_fk"
	FOREIGN KEY ("organization_id")
	REFERENCES "public"."organization"("id")
	ON DELETE cascade
	ON UPDATE no action;

ALTER TABLE "team_invite_link"
	ADD CONSTRAINT "team_invite_link_creator_id_user_id_fk"
	FOREIGN KEY ("creator_id")
	REFERENCES "public"."user"("id")
	ON DELETE cascade
	ON UPDATE no action;

CREATE INDEX "team_invite_link_organization_id_idx"
	ON "team_invite_link" USING btree ("organization_id");

CREATE UNIQUE INDEX "team_invite_link_token_hash_unique"
	ON "team_invite_link" USING btree ("token_hash");

CREATE UNIQUE INDEX "team_invite_link_active_organization_unique"
	ON "team_invite_link" USING btree ("organization_id")
	WHERE "team_invite_link"."revoked_at" IS NULL;
