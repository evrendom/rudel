import { describe, expect, test } from "bun:test";
import {
	type HistoricalSkillContentRow,
	type HistoricalSkillVersionUseRow,
	resolveHistoricalSkillVersions,
} from "./historical-skills.service.js";

describe("historical skill detail version guardrails", () => {
	test("caps newest-first versions at 100 and never returns one without content", () => {
		const versionRows = Array.from(
			{ length: 101 },
			(_, index): HistoricalSkillVersionUseRow => ({
				agent: index % 2 === 0 ? "claude" : "codex",
				content_sha256: String(index).padStart(64, "0"),
				first_used_at: "2026-08-01T00:00:00Z",
				last_used_at: new Date(
					Date.UTC(2026, 7, 20, 0, 0, 0) - index * 1_000,
				).toISOString(),
				session_count: 1,
			}),
		);
		const contentRows: HistoricalSkillContentRow[] = versionRows
			.slice(0, 100)
			.filter((_, index) => index !== 50)
			.map((row) => ({
				content: `content-${row.content_sha256}`,
				content_sha256: row.content_sha256,
			}));

		const resolved = resolveHistoricalSkillVersions(versionRows, contentRows);

		expect(resolved.versions).toHaveLength(99);
		expect(resolved.unavailableSessionCount).toBe(1);
		expect(
			resolved.versions.every((version) =>
				contentRows.some(
					(content) => content.content_sha256 === version.contentSha256,
				),
			),
		).toBe(true);
		expect(
			resolved.versions.some(
				(version) => version.contentSha256 === versionRows[100]?.content_sha256,
			),
		).toBe(false);
	});
});
