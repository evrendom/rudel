import { describe, expect, test } from "bun:test";
import { FILTERED_TRANSCRIPT_PATHS } from "@rudel/secret-filter";
import { z } from "zod";
import { IngestSessionInputSchema } from "../index.js";

const NON_TRANSCRIPT_STRING_PATHS: readonly string[] = [
	"cli_version",
	"client_surface",
	"gitBranch",
	"gitRemote",
	"gitSha",
	"organizationId",
	"packageName",
	"packageType",
	"platform_os",
	"projectPath",
	"sessionId",
	"source",
	"subagents[].agentId",
	"tag",
	"upload_mode",
];

describe("ingest transcript filter coverage", () => {
	test("classifies every string-bearing ingest field", () => {
		const classifiedPaths = [
			...NON_TRANSCRIPT_STRING_PATHS,
			...FILTERED_TRANSCRIPT_PATHS,
		].sort();

		expect([...getStringPaths(IngestSessionInputSchema)].sort()).toEqual(
			classifiedPaths,
		);
	});

	test("routes the exact transcript text paths through the shared filter", () => {
		expect(FILTERED_TRANSCRIPT_PATHS).toEqual([
			"content",
			"subagents[].content",
		]);
	});
});

function getStringPaths(schema: z.ZodTypeAny, prefix = ""): readonly string[] {
	if (schema instanceof z.ZodOptional) {
		return getStringPaths(schema.unwrap(), prefix);
	}
	if (schema instanceof z.ZodDefault) {
		return getStringPaths(schema.removeDefault(), prefix);
	}
	if (schema instanceof z.ZodEffects) {
		return getStringPaths(schema.innerType(), prefix);
	}
	if (schema instanceof z.ZodArray) {
		return getStringPaths(schema.element, `${prefix}[]`);
	}
	if (schema instanceof z.ZodObject) {
		return Object.entries(schema.shape).flatMap(([key, childSchema]) => {
			if (!(childSchema instanceof z.ZodType)) {
				return [];
			}
			return getStringPaths(childSchema, prefix ? `${prefix}.${key}` : key);
		});
	}
	if (schema instanceof z.ZodString || schema instanceof z.ZodEnum) {
		return [prefix];
	}
	return [];
}
