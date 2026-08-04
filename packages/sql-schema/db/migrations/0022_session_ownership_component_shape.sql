ALTER TABLE "session_ownership"
	ADD COLUMN "last_content_shape_json" text,
	ADD COLUMN "last_filter_version" integer,
	ADD COLUMN "last_session_date" timestamp with time zone;
