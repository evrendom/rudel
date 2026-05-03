DELETE FROM "wrapped_share"
WHERE "id" IN (
	SELECT "id"
	FROM (
		SELECT
			"id",
			row_number() OVER (
				PARTITION BY "user_id"
				ORDER BY "created_at" ASC, "id" ASC
			) AS "share_rank"
		FROM "wrapped_share"
	) AS "ranked_wrapped_share"
	WHERE "share_rank" > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wrapped_share_user_id_unique" ON "wrapped_share" USING btree ("user_id");
