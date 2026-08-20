import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("historical skills API guardrails", () => {
	test("keeps persistent reads workspace-scoped and off raw transcript tables", async () => {
		const serviceSource = await readFile(
			resolve(
				import.meta.dir,
				"..",
				"services",
				"historical-skills.service.ts",
			),
			"utf8",
		);

		expect(serviceSource).toContain("organizationId");
		expect(serviceSource).toContain("rudel.skill_version_contents");
		expect(serviceSource).not.toContain("rudel.claude_sessions");
		expect(serviceSource).not.toContain("rudel.codex_sessions");
		expect(serviceSource).not.toContain("argMax(content, ingested_at)");
		expect(serviceSource).toContain("uniqExact(tuple(");
		expect(serviceSource).toContain("{skillName:String}");
		expect(serviceSource).toContain("ORDER BY session_count DESC, name ASC");
		expect(serviceSource).toContain("max_execution_time: 30");
		expect(serviceSource).toContain('result_overflow_mode: "throw"');
		expect(serviceSource).toContain("HISTORICAL_SKILL_VERSION_LIMIT = 100");
		expect(serviceSource).toContain("LIMIT {versionLimit:UInt32}");
		expect(serviceSource).toContain(
			"content_sha256 IN {contentHashes:Array(String)}",
		);
		expect(serviceSource).toContain("INNER ANY JOIN");
		expect(serviceSource).toContain("filterSkillName: true");
		expect(serviceSource).not.toMatch(/'\$\{/);
	});

	test("isolates the temporary raw fallback behind explicit cutover routing", async () => {
		const [legacySource, handlerSource] = await Promise.all([
			readFile(
				resolve(
					import.meta.dir,
					"..",
					"services",
					"legacy-historical-skills.service.ts",
				),
				"utf8",
			),
			readFile(
				resolve(import.meta.dir, "..", "handlers", "analytics", "skills.ts"),
				"utf8",
			),
		]);
		expect(legacySource).toContain("rudel.codex_sessions");
		expect(handlerSource).toContain("shouldUsePersistentSkillAnalytics");
		expect(handlerSource).toContain("listHistoricalSkills");
		expect(handlerSource).toContain("listLegacyHistoricalCodexSkills");
	});

	test("applies organization middleware to both procedures", async () => {
		const handlerSource = await readFile(
			resolve(import.meta.dir, "..", "handlers", "analytics", "skills.ts"),
			"utf8",
		);

		expect(handlerSource.match(/\.use\(orgMiddleware\)/g)).toHaveLength(2);
		expect(
			handlerSource.match(/context\.organizationId/g)?.length,
		).toBeGreaterThanOrEqual(2);
	});
});
