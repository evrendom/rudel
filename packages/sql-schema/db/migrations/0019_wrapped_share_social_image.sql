ALTER TABLE "wrapped_share"
	ADD COLUMN "social_image_data_url" text;

WITH "valid_snapshots" AS MATERIALIZED (
	SELECT
		"id",
		"snapshot_json"::jsonb AS "snapshot"
	FROM "wrapped_share"
	WHERE pg_input_is_valid("snapshot_json", 'jsonb')
),
"legacy_images" AS MATERIALIZED (
	SELECT
		"id",
		"snapshot",
		"snapshot" ->> 'socialImageDataUrl' AS "data_url",
		substring("snapshot" ->> 'socialImageDataUrl' FROM 23) AS "base64"
	FROM "valid_snapshots"
	WHERE "snapshot" ? 'socialImageDataUrl'
)
UPDATE "wrapped_share" AS "target"
SET
	"social_image_data_url" = CASE
		WHEN
			"legacy_images"."data_url" ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
			AND length("legacy_images"."base64") % 4 = 0
			AND (
				(length("legacy_images"."base64")::bigint * 3) / 4
				- CASE
					WHEN right("legacy_images"."base64", 2) = '==' THEN 2
					WHEN right("legacy_images"."base64", 1) = '=' THEN 1
					ELSE 0
				END
			) <= 1048576
			THEN "legacy_images"."data_url"
		ELSE NULL
	END,
	"snapshot_json" = ("legacy_images"."snapshot" - 'socialImageDataUrl')::text
FROM "legacy_images"
WHERE "target"."id" = "legacy_images"."id";
