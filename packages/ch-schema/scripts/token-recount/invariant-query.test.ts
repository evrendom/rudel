import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const query = readFileSync(
	resolve(import.meta.dir, "../../queries/token-class-invariants.sql"),
	"utf8",
);

test("scheduled token invariants remain scoped and bounded", () => {
	for (const invariant of [
		"claude_input_includes_cache",
		"codex_cache_read_is_input_subset",
		"codex_has_no_cache_creation_class",
		"total_is_input_plus_output",
		"reupload_final_identity_is_idempotent",
	]) {
		expect(query).toContain(`'${invariant}'`);
	}

	expect(query).toContain("{organizationId:String}");
	expect(query).toContain("{lookbackDays:UInt32}");
	expect(query).toContain("FROM rudel.session_analytics FINAL");
	expect(query).toContain("LEFT ANY JOIN");
	expect(query).toContain("max_execution_time = 30");
	expect(query).toContain("max_rows_to_read = 1000000000");
	expect(query).toContain("max_bytes_to_read = 100000000000");
	expect(query).not.toContain("SELECT *");
});
