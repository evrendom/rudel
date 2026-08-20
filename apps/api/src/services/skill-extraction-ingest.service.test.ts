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
	test("collapses each logical row with one tuple argMax and an ANY receipt join", () => {
		const cte = buildActiveSkillUsesCte({ filterSkillName: true });

		expect(cte).toContain("latest_skill_receipts");
		expect(cte).toContain("latest_skill_use_rows");
		expect(cte.match(/argMax\(/gu)).toHaveLength(2);
		expect(cte).toContain("tuple(source_content_sha256, parser_version");
		expect(cte).toContain("extraction_seq");
		expect(cte).toContain("AND skill_name = {skillName:String}");
		expect(cte).toContain("INNER ANY JOIN");
		expect(cte).toContain(
			"uses.source_content_sha256 = receipts.receipt_source_content_sha256",
		);
		expect(cte).toContain(
			"uses.parser_version = receipts.receipt_parser_version",
		);
		expect(cte).not.toContain("FINAL");
	});

	test("writes uses, absent-use tombstones, and a separate run receipt", () => {
		const run = createSkillExtractionRun({
			extractedAt: new Date("2026-08-20T10:05:00.000Z"),
			extraction: EXTRACTION,
			organizationId: "org-1",
			sessionDate: new Date("2026-08-20T09:00:00.000Z"),
			sessionId: "session-1",
			userId: "user-1",
		});
		const rows = buildSkillExtractionRows(
			run,
			[
				{ skill_name: "removed", used_at: "2026-08-19 09:00:00.000" },
				{ skill_name: "readable", used_at: "2026-08-19 09:00:00.000" },
			],
			[],
		);

		expect(rows.useRows).toHaveLength(3);
		expect(rows.receiptRows).toHaveLength(1);
		expect(
			rows.useRows.find((row) => row.skill_name === "readable"),
		).toMatchObject({
			content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			is_deleted: 0,
			extraction_seq: run.extractionSeq,
		});
		expect(
			rows.useRows.find((row) => row.skill_name === "unavailable"),
		).toMatchObject({ content_sha256: "", is_deleted: 0 });
		expect(
			rows.useRows.find((row) => row.skill_name === "removed"),
		).toMatchObject({ content_sha256: "", is_deleted: 1 });
		expect(rows.receiptRows[0]).toMatchObject({
			extraction_seq: run.extractionSeq,
			parser_version: 1,
			source_content_sha256: "a".repeat(64),
		});
		expect(rows.contentRows[0]?.extraction_seq).toBe(run.extractionSeq);
	});

	test("selects a whole higher-sequence run when timestamps tie", () => {
		const extractedAt = new Date("2026-08-20T10:05:00.000Z");
		const base = {
			extractedAt,
			organizationId: "org-1",
			sessionDate: new Date("2026-08-20T09:00:00.000Z"),
			sessionId: "session-1",
			userId: "user-1",
		};
		const older = buildSkillExtractionRows(
			{
				...base,
				extraction: {
					...EXTRACTION,
					sourceContentSha256: "1".repeat(64),
					uses: [{ ...READABLE_USE, content: "older" }],
				},
				extractionSeq: buildSkillExtractionSeq(extractedAt, 1),
			},
			[],
			[],
		);
		const newer = buildSkillExtractionRows(
			{
				...base,
				extraction: {
					...EXTRACTION,
					parserVersion: 2,
					sourceContentSha256: "2".repeat(64),
					uses: [{ ...READABLE_USE, content: "newer" }],
				},
				extractionSeq: buildSkillExtractionSeq(extractedAt, 2),
			},
			[],
			[],
		);

		const merged = mergeSkillExtractionRows([newer, older]);
		expect(merged.receiptRows).toEqual(newer.receiptRows);
		expect(merged.useRows).toEqual(newer.useRows);
		expect(merged.receiptRows[0]?.parser_version).toBe(2);
		expect(merged.useRows[0]?.source_content_sha256).toBe("2".repeat(64));
		expect(merged.useRows[0]?.content_sha256).toBe(
			newer.contentRows[0]?.content_sha256,
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
