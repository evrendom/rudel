import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { RepoKey } from "@rudel/skill-schema";

interface SqlQuery {
	sql: string;
	values: unknown[];
}

const queries: SqlQuery[] = [];
let queryRouter: ((sql: string, values: unknown[]) => unknown[]) | null = null;

function sqlClient(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join("?").replace(/\s+/gu, " ").trim();
	queries.push({ sql, values });

	if (!queryRouter) {
		throw new Error(`unexpected query without router: ${sql}`);
	}
	return queryRouter(sql, values);
}

mock.module("../db.js", () => ({
	sqlClient,
}));

const {
	getSkillBlueprintBySlug,
	hashRepoKey,
	publishSkillBlueprintDraft,
	reportSkillInstallsBulk,
} = await import("./skill-blueprints.service.js");

const env = {
	organizationId: "org_1",
	userId: "user_1",
};

describe("skill blueprint service", () => {
	beforeEach(() => {
		queries.length = 0;
		queryRouter = null;
	});

	test("getBySlug seeds the canonical typescript standards blueprint", async () => {
		const createdAt = new Date("2026-05-09T12:00:00Z");
		queryRouter = (sql) => {
			if (sql.includes("FROM skill_blueprint") && sql.includes("LIMIT 1")) {
				const alreadySeeded = queries.filter((query) =>
					query.sql.includes("INSERT INTO skill_blueprint_version"),
				).length;
				if (alreadySeeded === 0) return [];
				return [
					{
						id: "bp_typescript",
						organizationId: "org_1",
						slug: "typescript-standards",
						name: "TypeScript Standards",
						currentVersionId: "version_1",
						createdAt,
						updatedAt: createdAt,
						versionId: "version_1",
						version: "1.0.0",
						state: "published",
						payload: {
							id: "typescript-standards",
							slug: "typescript-standards",
							name: "TypeScript Standards",
							description: "TypeScript coding standards.",
							trigger: "Use when writing TypeScript.",
							version: "1.0.0",
							modules: [],
							variables: [],
							targets: ["claude_code"],
							blocks: [],
						},
						modules: [],
						createdByUserId: "user_1",
						versionCreatedAt: createdAt,
						publishedAt: createdAt,
					},
				];
			}
			if (sql.startsWith("INSERT INTO skill_blueprint ")) {
				return [
					{
						id: "bp_typescript",
						organizationId: "org_1",
						slug: "typescript-standards",
						name: "TypeScript Standards",
						currentVersionId: null,
						createdAt,
						updatedAt: createdAt,
					},
				];
			}
			if (sql.startsWith("INSERT INTO skill_blueprint_version")) return [];
			if (sql.startsWith("UPDATE skill_blueprint")) return [];
			throw new Error(`unexpected SQL: ${sql}`);
		};

		const result = await getSkillBlueprintBySlug("typescript-standards", env);

		expect(result?.blueprint.slug).toBe("typescript-standards");
		expect(result?.latestVersion?.state).toBe("published");
		expect(
			queries.some((query) =>
				query.sql.includes("INSERT INTO skill_blueprint_version"),
			),
		).toBe(true);
	});

	test("publishDraft creates a new immutable published version", async () => {
		const createdAt = new Date("2026-05-09T12:00:00Z");
		queryRouter = (sql) => {
			if (sql.startsWith("SELECT")) {
				return [
					{
						id: "draft_1",
						blueprintId: "bp_typescript",
						organizationId: "org_1",
						version: "draft",
						state: "draft",
						payload: {
							id: "typescript-standards",
							slug: "typescript-standards",
							name: "TypeScript Standards",
							description: "TypeScript coding standards.",
							trigger: "Use when writing TypeScript.",
							version: "1.0.0",
							modules: [],
							variables: [],
							targets: ["claude_code"],
							blocks: [],
						},
						modules: [],
						createdByUserId: "user_1",
						createdAt,
						publishedAt: null,
					},
				];
			}
			if (sql.startsWith("INSERT INTO skill_blueprint_version")) {
				return [
					{
						id: "published_1",
						blueprintId: "bp_typescript",
						organizationId: "org_1",
						version: "1.0.1",
						state: "published",
						payload: {
							id: "typescript-standards",
							slug: "typescript-standards",
							name: "TypeScript Standards",
							description: "TypeScript coding standards.",
							trigger: "Use when writing TypeScript.",
							version: "1.0.0",
							modules: [],
							variables: [],
							targets: ["claude_code"],
							blocks: [],
						},
						modules: [],
						createdByUserId: "user_1",
						createdAt,
						publishedAt: createdAt,
					},
				];
			}
			if (sql.startsWith("UPDATE skill_blueprint")) return [];
			throw new Error(`unexpected SQL: ${sql}`);
		};

		const result = await publishSkillBlueprintDraft(
			{ draftVersionId: "draft_1", version: "1.0.1" },
			env,
		);

		expect(result?.id).toBe("published_1");
		expect(result?.state).toBe("published");
		expect(queries.at(-1)?.sql).toContain("UPDATE skill_blueprint");
	});

	test("reportBulk stores metadata without generated content", async () => {
		const reportedAt = new Date("2026-05-09T12:00:00Z");
		const repoKey: RepoKey = {
			kind: "github",
			value: "github.com/company/api",
		};
		queryRouter = (sql, values) => {
			if (sql.startsWith("INSERT INTO repo_registry")) return [];
			if (sql.startsWith("INSERT INTO skill_install_report")) {
				expect(values).not.toContain("generated file content");
				return [
					{
						id: "report_1",
						organizationId: "org_1",
						reportedByUserId: "user_1",
						blueprintId: "typescript-standards",
						blueprintVersionId: "version_1",
						repoKey,
						artifactTarget: "claude_code",
						targetPath: ".claude/skills/typescript-standards/SKILL.md",
						status: "current",
						generatedHash: "hash_generated",
						currentFileHash: "hash_current",
						overlayHash: "overlay",
						schemaVersion: "1",
						compilerVersion: "1",
						reportedAt,
					},
				];
			}
			throw new Error(`unexpected SQL: ${sql}`);
		};

		const result = await reportSkillInstallsBulk(
			[
				{
					blueprintId: "typescript-standards",
					blueprintVersionId: "version_1",
					repoKey,
					artifactTarget: "claude_code",
					targetPath: ".claude/skills/typescript-standards/SKILL.md",
					status: "current",
					generatedHash: "hash_generated",
					currentFileHash: "hash_current",
					overlayHash: "overlay",
					schemaVersion: "1",
					compilerVersion: "1",
				},
			],
			env,
		);

		expect(result).toHaveLength(1);
		expect(result[0]?.repoKey).toEqual(repoKey);
		expect(hashRepoKey(repoKey)).toBe(hashRepoKey({ ...repoKey }));
	});
});
