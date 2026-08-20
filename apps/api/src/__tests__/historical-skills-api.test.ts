import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("historical skills API guardrails", () => {
	test("keeps list and detail reads workspace-scoped and Codex-only", async () => {
		const serviceSource = await readFile(
			resolve(
				import.meta.dir,
				"..",
				"services",
				"historical-skills.service.ts",
			),
			"utf8",
		);

		expect(serviceSource).toContain(
			"PREWHERE organization_id = {orgId:String}",
		);
		expect(serviceSource.match(/FROM rudel\.codex_sessions/g)).toHaveLength(2);
		expect(serviceSource).not.toContain("rudel.session_analytics");
		expect(serviceSource).toContain("uniqExact(session_id)");
		expect(serviceSource).toContain("{skillName:String}");
		expect(serviceSource).toContain("ORDER BY session_count DESC, name ASC");
		expect(serviceSource).not.toMatch(/'\$\{/);
	});

	test("applies organization middleware to both procedures", async () => {
		const handlerSource = await readFile(
			resolve(import.meta.dir, "..", "handlers", "analytics", "skills.ts"),
			"utf8",
		);

		expect(handlerSource.match(/\.use\(orgMiddleware\)/g)).toHaveLength(2);
		expect(handlerSource.match(/context\.organizationId/g)).toHaveLength(2);
	});
});
