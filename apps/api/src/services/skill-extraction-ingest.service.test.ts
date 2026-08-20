import { describe, expect, test } from "bun:test";
import {
	buildActiveSkillUsesCte,
	buildSkillExtractionRows,
	buildSkillExtractionSeq,
	createSkillExtractionRun,
	hasMatchingSkillExtractionReceipt,
	mergeSkillExtractionRows,
	readSkillExtractionReceipt,
} from "./skill-extraction-ingest.service.js";

const READABLE_USE = {
	content: "# Readable\n",
	name: "readable",
	usedAt: "2026-08-20T10:00:00.000Z",
};

const EXTRACTION = {
	agent: "claude" as const,
	parserVersion: 1,
	sourceContentSha256: "a".repeat(64),
	uses: [
		READABLE_USE,
		{
			content: null,
			name: "unavailable",
			usedAt: "2026-08-20T10:01:00.000Z",
		},
	],
};

describe("skill extraction persistence rows", () => {
	test("selects the committed generation before collapsing identical retries", () => {
		const cte = buildActiveSkillUsesCte({ filterSkillName: true });

		expect(cte).toContain("latest_skill_receipts");
		expect(cte).toContain("committed_skill_use_row_states");
		expect(cte.match(/argMax\(/gu)).toHaveLength(2);
		expect(cte).toContain("tuple(source_content_sha256, parser_version");
		expect(cte).toContain("extraction_seq");
		expect(cte).toContain("AND skill_name = {skillName:String}");
		expect(cte).toContain("skill_filtered_use_identities");
		expect(cte).toContain("SELECT DISTINCT user_id, agent, session_id");
		expect(cte).toContain("FROM skill_filtered_use_identities");
		expect(cte).toContain("INNER ANY JOIN");
		expect(cte).toContain(
			"uses.extraction_seq = receipts.receipt_extraction_seq",
		);
		expect(cte).toContain(
			"uses.source_content_sha256 = receipts.receipt_source_content_sha256",
		);
		expect(cte).toContain(
			"uses.parser_version = receipts.receipt_parser_version",
		);
		expect(cte).not.toContain("FINAL");
	});

	test("writes current uses and a separate run receipt without tombstones", () => {
		const run = createSkillExtractionRun({
			extractedAt: new Date("2026-08-20T10:05:00.000Z"),
			extraction: EXTRACTION,
			organizationId: "org-1",
			rawRevisionIngestedAt: new Date("2026-08-20T10:04:00.000Z"),
			sessionDate: new Date("2026-08-20T09:00:00.000Z"),
			sessionId: "session-1",
			userId: "user-1",
		});
		const rows = buildSkillExtractionRows(run, []);

		expect(rows.useRows).toHaveLength(2);
		expect(rows.receiptRows).toHaveLength(1);
		expect(
			rows.useRows.find((row) => row.skill_name === "readable"),
		).toMatchObject({
			content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			extraction_seq: run.extractionSeq,
		});
		expect(
			rows.useRows.find((row) => row.skill_name === "unavailable"),
		).toMatchObject({ content_sha256: "" });
		expect(rows.useRows.some((row) => row.skill_name === "removed")).toBe(
			false,
		);
		expect(rows.receiptRows[0]).toMatchObject({
			extraction_seq: run.extractionSeq,
			parser_version: 1,
			source_content_sha256: "a".repeat(64),
		});
		expect(rows.contentRows[0]?.extraction_seq).toBe(run.extractionSeq);
		expect(rows.contentRows[0]?.user_id).toBe("user-1");
	});

	test("a newer raw revision wins even when its extraction finishes first", () => {
		const olderRevision = new Date("2026-08-20T10:04:00.000Z");
		const newerRevision = new Date("2026-08-20T10:05:00.000Z");
		const olderSeq = buildSkillExtractionSeq(olderRevision, 1);
		const newerSeq = buildSkillExtractionSeq(newerRevision, 1);
		const base = {
			organizationId: "org-1",
			sessionDate: new Date("2026-08-20T09:00:00.000Z"),
			sessionId: "session-1",
			userId: "user-1",
		};
		const older = buildSkillExtractionRows(
			{
				...base,
				extractedAt: new Date("2026-08-20T10:10:00.000Z"),
				extraction: {
					...EXTRACTION,
					sourceContentSha256: "1".repeat(64),
					uses: [{ ...READABLE_USE, content: "older" }],
				},
				extractionSeq: olderSeq,
				rawRevisionIngestedAt: olderRevision,
			},
			[],
		);
		const newer = buildSkillExtractionRows(
			{
				...base,
				extractedAt: new Date("2026-08-20T10:06:00.000Z"),
				extraction: {
					...EXTRACTION,
					sourceContentSha256: "2".repeat(64),
					uses: [{ ...READABLE_USE, content: "newer" }],
				},
				extractionSeq: newerSeq,
				rawRevisionIngestedAt: newerRevision,
			},
			[],
		);

		const merged = mergeSkillExtractionRows([newer, older]);
		expect(merged.receiptRows).toEqual(newer.receiptRows);
		expect(merged.useRows).toHaveLength(2);
		expect(merged.useRows.map((row) => row.extraction_seq).sort()).toEqual(
			[olderSeq, newerSeq].sort(),
		);
	});

	test("a higher parser replay wins for the same raw revision", () => {
		const rawRevision = new Date("2026-08-20T10:05:00.000Z");
		const parserOne = buildSkillExtractionSeq(rawRevision, 1);
		const parserTwo = buildSkillExtractionSeq(rawRevision, 2);

		expect(BigInt(parserTwo)).toBeGreaterThan(BigInt(parserOne));
		expect(BigInt(parserTwo)).toBeLessThanOrEqual(2n ** 64n - 1n);
		expect(parserTwo).toBe(
			((BigInt(rawRevision.getTime()) << 16n) | 2n).toString(),
		);
	});

	test("fresh attempts for the same revision and parser have identical sequences", () => {
		const input = {
			extractedAt: new Date("2026-08-20T10:06:00.000Z"),
			extraction: EXTRACTION,
			organizationId: "org-1",
			rawRevisionIngestedAt: new Date("2026-08-20T10:05:00.000Z"),
			sessionDate: new Date("2026-08-20T09:00:00.000Z"),
			sessionId: "session-1",
			userId: "user-1",
		};

		expect(createSkillExtractionRun(input).extractionSeq).toBe(
			createSkillExtractionRun(input).extractionSeq,
		);
	});

	test("matches receipts only on source hash and parser version", () => {
		expect(
			hasMatchingSkillExtractionReceipt(
				{ parserVersion: 1, sourceContentSha256: "a".repeat(64) },
				EXTRACTION,
			),
		).toBe(true);
		expect(
			hasMatchingSkillExtractionReceipt(
				{ parserVersion: 2, sourceContentSha256: "a".repeat(64) },
				EXTRACTION,
			),
		).toBe(false);
		expect(hasMatchingSkillExtractionReceipt(null, EXTRACTION)).toBe(false);
	});

	test("exports the receipt reader for backfill and reconciliation", () => {
		expect(typeof readSkillExtractionReceipt).toBe("function");
	});
});
