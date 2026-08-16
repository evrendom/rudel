import { describe, expect, test } from "bun:test";
import usageEventsSchema from "../db/schema/usage-events.js";

describe("usage_events physical schema", () => {
	test("uses a versioned immutable event key without a partition boundary", () => {
		const definition = JSON.stringify(usageEventsSchema);

		expect(definition).toContain("SharedReplacingMergeTree(event_version)");
		expect(definition).toContain("organization_id");
		expect(definition).toContain("session_id");
		expect(definition).toContain("event_id");
		expect(definition).toContain("model_rate_card_version");
		expect(definition).toContain("model_provider");
		expect(definition).toContain("inference_speed");
		expect(definition).toContain("inference_geo");
		expect(definition).toContain("receipt_is_complete");
		expect(definition).toContain("usage_date_minmax");
		expect(definition).toContain('"type":"minmax"');
		expect(definition).not.toContain("partitionBy");
		expect(definition).not.toContain('"ttl"');
	});

	test("the checked-in migration matches the source key and replacement engine", async () => {
		const migration = await Bun.file(
			new URL(
				"../../chx/migrations/20260803170000_usage_events.sql",
				import.meta.url,
			),
		).text();

		expect(migration).toContain("ReplacingMergeTree(event_version)");
		expect(migration).toContain("model_rate_card_version");
		expect(migration).toContain("receipt_is_complete");
		expect(migration).toContain(
			"INDEX `usage_date_minmax` (usage_date) TYPE minmax GRANULARITY 1",
		);
		expect(migration).toContain("Retention decision: no TTL");
		expect(migration).toContain(
			"must DROP TABLE rudel.usage_events and re-run this migration",
		);
		expect(migration).toContain(
			"PRIMARY KEY (`organization_id`, `user_id`, `source`, `session_id`, `event_id`)",
		);
		expect(migration).not.toContain("PARTITION BY");
		expect(migration).not.toContain("ALTER TABLE rudel.session_analytics");
	});

	test("pricing provenance migration is additive, non-null, and key-neutral", async () => {
		const migration = await Bun.file(
			new URL(
				"../../chx/migrations/20260805120000_usage_event_pricing_provenance.sql",
				import.meta.url,
			),
		).text();

		for (const column of [
			"model_provider",
			"inference_speed",
			"inference_geo",
		]) {
			expect(migration).toContain(
				`ADD COLUMN IF NOT EXISTS \`${column}\` LowCardinality(String) DEFAULT ''`,
			);
		}
		expect(migration).not.toContain("DROP");
		expect(migration).not.toContain("MODIFY ORDER BY");
		expect(migration).not.toContain("OPTIMIZE");
	});
});
