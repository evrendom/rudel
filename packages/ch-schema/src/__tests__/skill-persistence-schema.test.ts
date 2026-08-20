import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import skillPersistenceSchema from "../db/schema/skill-uses.js";

describe("skill persistence physical schema", () => {
	test("uses sequence-versioned replacement keys without partition boundaries", () => {
		const definition = JSON.stringify(skillPersistenceSchema);

		expect(definition).toContain("SharedReplacingMergeTree(extraction_seq)");
		expect(definition).toContain("skill_receipts");
		expect(definition).toContain("skill_uses");
		expect(definition).toContain("skill_version_contents");
		expect(definition).toContain("source_content_sha256");
		expect(definition).toContain("parser_version");
		expect(definition).toContain("is_deleted");
		expect(definition).toContain("extraction_seq");
		expect(definition).not.toContain("record_kind");
		expect(definition).not.toContain("partitionBy");
		expect(definition).not.toContain('"ttl"');
	});

	test("the checked-in migration has prefix-aligned immutable keys", async () => {
		const migrationDirectory = fileURLToPath(
			new URL("../../chx/migrations/", import.meta.url),
		);
		const migrationFiles = (await readdir(migrationDirectory)).filter((name) =>
			name.endsWith(".sql"),
		);
		const migrations = await Promise.all(
			migrationFiles.map((name) =>
				readFile(`${migrationDirectory}/${name}`, "utf8"),
			),
		);
		const migration = migrations.find((sql) =>
			sql.includes("CREATE TABLE IF NOT EXISTS rudel.skill_receipts"),
		);
		if (migration === undefined) {
			throw new Error("Skill persistence migration was not generated");
		}

		expect(migration).toContain("ReplacingMergeTree(extraction_seq)");
		expect(migration).toContain("`extraction_seq` UInt64");
		expect(migration).toContain(
			"PRIMARY KEY (`organization_id`, `user_id`, `agent`, `session_id`)",
		);
		expect(migration).toContain(
			"PRIMARY KEY (`organization_id`, `skill_name`, `agent`, `user_id`, `session_id`)",
		);
		expect(migration).toContain(
			"PRIMARY KEY (`organization_id`, `skill_name`, `content_sha256`)",
		);
		expect(migration).not.toContain("PARTITION BY");

		const usesDefinition = migration.match(
			/CREATE TABLE IF NOT EXISTS rudel\.skill_uses([\s\S]*?);/u,
		)?.[1];
		expect(usesDefinition).toBeDefined();
		expect(usesDefinition).not.toContain("record_kind");
		const usesKey = usesDefinition?.match(/PRIMARY KEY \(([^)]+)\)/u)?.[1];
		expect(usesKey).toBeDefined();
		expect(usesKey).not.toContain("used_at");
		expect(usesKey).not.toContain("content_sha256");
		expect(usesKey).not.toContain("parser_version");
		expect(usesKey).not.toContain("extracted_at");
	});
});
