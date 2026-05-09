import { createHash, randomUUID } from "node:crypto";
import type {
	RepoOverlayInput,
	SkillInstallReportInput,
} from "@rudel/api-routes";
import {
	SkillBlueprintVersionRecordSchema,
	SkillBlueprintWithLatestSchema,
	SkillInstallReportRecordSchema,
} from "@rudel/api-routes";
import {
	typescriptStandardsBlueprint,
	typescriptStandardsModules,
} from "@rudel/skill-compiler";
import type { RepoKey } from "@rudel/skill-schema";
import { sqlClient } from "../db.js";

interface OrgUserEnv {
	organizationId: string;
	userId: string;
}

export async function listSkillBlueprints(env: OrgUserEnv) {
	await ensureTypescriptStandardsBlueprint(env);
	const rows = await sqlClient<Array<SkillBlueprintWithLatestRow>>`
		SELECT
			b.id,
			b.organization_id AS "organizationId",
			b.slug,
			b.name,
			b.current_version_id AS "currentVersionId",
			b.created_at AS "createdAt",
			b.updated_at AS "updatedAt",
			v.id AS "versionId",
			v.version,
			v.state,
			v.payload,
			v.modules,
			v.created_by_user_id AS "createdByUserId",
			v.created_at AS "versionCreatedAt",
			v.published_at AS "publishedAt"
		FROM skill_blueprint b
		LEFT JOIN skill_blueprint_version v
			ON v.id = b.current_version_id
		WHERE b.organization_id = ${env.organizationId}
		ORDER BY b.slug ASC
	`;

	return rows.map(mapBlueprintWithLatest);
}

export async function getSkillBlueprintBySlug(slug: string, env: OrgUserEnv) {
	if (slug === "typescript-standards") {
		await ensureTypescriptStandardsBlueprint(env);
	}

	const [row] = await sqlClient<Array<SkillBlueprintWithLatestRow>>`
		SELECT
			b.id,
			b.organization_id AS "organizationId",
			b.slug,
			b.name,
			b.current_version_id AS "currentVersionId",
			b.created_at AS "createdAt",
			b.updated_at AS "updatedAt",
			v.id AS "versionId",
			v.version,
			v.state,
			v.payload,
			v.modules,
			v.created_by_user_id AS "createdByUserId",
			v.created_at AS "versionCreatedAt",
			v.published_at AS "publishedAt"
		FROM skill_blueprint b
		LEFT JOIN skill_blueprint_version v
			ON v.id = b.current_version_id
		WHERE b.organization_id = ${env.organizationId}
			AND b.slug = ${slug}
		LIMIT 1
	`;

	return row ? mapBlueprintWithLatest(row) : null;
}

export async function saveSkillBlueprintDraft(
	input: {
		slug: string;
		name: string;
		version: string;
		payload: unknown;
		modules: unknown[];
	},
	env: OrgUserEnv,
) {
	const blueprint = await upsertBlueprint(
		{ name: input.name, slug: input.slug },
		env,
	);
	const [existingDraft] = await sqlClient<Array<{ id: string }>>`
		SELECT id
		FROM skill_blueprint_version
		WHERE organization_id = ${env.organizationId}
			AND blueprint_id = ${blueprint.id}
			AND state = 'draft'
		ORDER BY created_at DESC
		LIMIT 1
	`;

	if (existingDraft) {
		const [row] = await sqlClient<Array<SkillBlueprintVersionRow>>`
			UPDATE skill_blueprint_version
			SET
				version = ${input.version},
				payload = ${JSON.stringify(input.payload)}::jsonb,
				modules = ${JSON.stringify(input.modules)}::jsonb
			WHERE id = ${existingDraft.id}
			RETURNING
				id,
				blueprint_id AS "blueprintId",
				organization_id AS "organizationId",
				version,
				state,
				payload,
				modules,
				created_by_user_id AS "createdByUserId",
				created_at AS "createdAt",
				published_at AS "publishedAt"
		`;
		return parseVersionRow(row);
	}

	const [row] = await sqlClient<Array<SkillBlueprintVersionRow>>`
		INSERT INTO skill_blueprint_version (
			id,
			blueprint_id,
			organization_id,
			version,
			state,
			payload,
			modules,
			created_by_user_id
		)
		VALUES (
			${randomUUID()},
			${blueprint.id},
			${env.organizationId},
			${input.version},
			'draft',
			${JSON.stringify(input.payload)}::jsonb,
			${JSON.stringify(input.modules)}::jsonb,
			${env.userId}
		)
		RETURNING
			id,
			blueprint_id AS "blueprintId",
			organization_id AS "organizationId",
			version,
			state,
			payload,
			modules,
			created_by_user_id AS "createdByUserId",
			created_at AS "createdAt",
			published_at AS "publishedAt"
	`;
	return parseVersionRow(row);
}

export async function publishSkillBlueprintDraft(
	input: { draftVersionId: string; version: string },
	env: OrgUserEnv,
) {
	const [draft] = await sqlClient<Array<SkillBlueprintVersionRow>>`
		SELECT
			id,
			blueprint_id AS "blueprintId",
			organization_id AS "organizationId",
			version,
			state,
			payload,
			modules,
			created_by_user_id AS "createdByUserId",
			created_at AS "createdAt",
			published_at AS "publishedAt"
		FROM skill_blueprint_version
		WHERE id = ${input.draftVersionId}
			AND organization_id = ${env.organizationId}
			AND state = 'draft'
		LIMIT 1
	`;
	if (!draft) return null;

	const publishedId = randomUUID();
	const [published] = await sqlClient<Array<SkillBlueprintVersionRow>>`
		INSERT INTO skill_blueprint_version (
			id,
			blueprint_id,
			organization_id,
			version,
			state,
			payload,
			modules,
			created_by_user_id,
			published_at
		)
		VALUES (
			${publishedId},
			${draft.blueprintId},
			${env.organizationId},
			${input.version},
			'published',
			${JSON.stringify(draft.payload)}::jsonb,
			${JSON.stringify(draft.modules)}::jsonb,
			${env.userId},
			${new Date()}
		)
		RETURNING
			id,
			blueprint_id AS "blueprintId",
			organization_id AS "organizationId",
			version,
			state,
			payload,
			modules,
			created_by_user_id AS "createdByUserId",
			created_at AS "createdAt",
			published_at AS "publishedAt"
	`;
	await sqlClient`
		UPDATE skill_blueprint
		SET current_version_id = ${publishedId}, updated_at = ${new Date()}
		WHERE id = ${draft.blueprintId}
			AND organization_id = ${env.organizationId}
	`;
	return parseVersionRow(published);
}

export async function getRepoOverlay(
	input: { repoKey: RepoKey; blueprintId: string },
	env: OrgUserEnv,
) {
	const [row] = await sqlClient<Array<RepoOverlayRow>>`
		SELECT
			id,
			organization_id AS "organizationId",
			repo_key AS "repoKey",
			blueprint_id AS "blueprintId",
			overlay,
			overlay_hash AS "overlayHash",
			updated_by_user_id AS "updatedByUserId",
			updated_at AS "updatedAt"
		FROM repo_overlay
		WHERE organization_id = ${env.organizationId}
			AND repo_key_hash = ${hashRepoKey(input.repoKey)}
			AND blueprint_id = ${input.blueprintId}
		LIMIT 1
	`;
	return row ? mapRepoOverlay(row) : null;
}

export async function upsertRepoOverlay(
	input: RepoOverlayInput,
	env: OrgUserEnv,
) {
	const repoKeyHash = hashRepoKey(input.repoKey);
	await upsertRepoRegistry(input.repoKey, repoKeyHash, env);
	const [row] = await sqlClient<Array<RepoOverlayRow>>`
		INSERT INTO repo_overlay (
			id,
			organization_id,
			repo_key,
			repo_key_hash,
			blueprint_id,
			overlay,
			overlay_hash,
			updated_by_user_id
		)
		VALUES (
			${randomUUID()},
			${env.organizationId},
			${JSON.stringify(input.repoKey)}::jsonb,
			${repoKeyHash},
			${input.blueprintId},
			${JSON.stringify(input.overlay)}::jsonb,
			${input.overlayHash},
			${env.userId}
		)
		ON CONFLICT (organization_id, repo_key_hash, blueprint_id)
		DO UPDATE SET
			overlay = EXCLUDED.overlay,
			overlay_hash = EXCLUDED.overlay_hash,
			updated_by_user_id = EXCLUDED.updated_by_user_id,
			updated_at = ${new Date()}
		RETURNING
			id,
			organization_id AS "organizationId",
			repo_key AS "repoKey",
			blueprint_id AS "blueprintId",
			overlay,
			overlay_hash AS "overlayHash",
			updated_by_user_id AS "updatedByUserId",
			updated_at AS "updatedAt"
	`;
	return mapRepoOverlay(expectRow(row, "repo overlay"));
}

export async function reportSkillInstallsBulk(
	reports: SkillInstallReportInput[],
	env: OrgUserEnv,
) {
	const rows = [];
	for (const report of reports) {
		const repoKeyHash = hashRepoKey(report.repoKey);
		await upsertRepoRegistry(report.repoKey, repoKeyHash, env);
		const [row] = await sqlClient<Array<SkillInstallReportRow>>`
			INSERT INTO skill_install_report (
				id,
				organization_id,
				reported_by_user_id,
				blueprint_id,
				blueprint_version_id,
				repo_key,
				repo_key_hash,
				artifact_target,
				target_path,
				status,
				generated_hash,
				current_file_hash,
				overlay_hash,
				schema_version,
				compiler_version
			)
			VALUES (
				${randomUUID()},
				${env.organizationId},
				${env.userId},
				${report.blueprintId},
				${report.blueprintVersionId},
				${JSON.stringify(report.repoKey)}::jsonb,
				${repoKeyHash},
				${report.artifactTarget},
				${report.targetPath},
				${report.status},
				${report.generatedHash},
				${report.currentFileHash ?? null},
				${report.overlayHash},
				${report.schemaVersion},
				${report.compilerVersion}
			)
			ON CONFLICT (
				organization_id,
				repo_key_hash,
				blueprint_id,
				artifact_target,
				target_path
			)
			DO UPDATE SET
				reported_by_user_id = EXCLUDED.reported_by_user_id,
				blueprint_version_id = EXCLUDED.blueprint_version_id,
				repo_key = EXCLUDED.repo_key,
				status = EXCLUDED.status,
				generated_hash = EXCLUDED.generated_hash,
				current_file_hash = EXCLUDED.current_file_hash,
				overlay_hash = EXCLUDED.overlay_hash,
				schema_version = EXCLUDED.schema_version,
				compiler_version = EXCLUDED.compiler_version,
				reported_at = ${new Date()}
			RETURNING
				id,
				organization_id AS "organizationId",
				reported_by_user_id AS "reportedByUserId",
				blueprint_id AS "blueprintId",
				blueprint_version_id AS "blueprintVersionId",
				repo_key AS "repoKey",
				artifact_target AS "artifactTarget",
				target_path AS "targetPath",
				status,
				generated_hash AS "generatedHash",
				current_file_hash AS "currentFileHash",
				overlay_hash AS "overlayHash",
				schema_version AS "schemaVersion",
				compiler_version AS "compilerVersion",
				reported_at AS "reportedAt"
		`;
		rows.push(mapInstallReport(expectRow(row, "skill install report")));
	}
	return rows;
}

export async function listSkillInstallsByBlueprint(
	blueprintId: string,
	env: OrgUserEnv,
) {
	const rows = await sqlClient<Array<SkillInstallReportRow>>`
		SELECT
			id,
			organization_id AS "organizationId",
			reported_by_user_id AS "reportedByUserId",
			blueprint_id AS "blueprintId",
			blueprint_version_id AS "blueprintVersionId",
			repo_key AS "repoKey",
			artifact_target AS "artifactTarget",
			target_path AS "targetPath",
			status,
			generated_hash AS "generatedHash",
			current_file_hash AS "currentFileHash",
			overlay_hash AS "overlayHash",
			schema_version AS "schemaVersion",
			compiler_version AS "compilerVersion",
			reported_at AS "reportedAt"
		FROM skill_install_report
		WHERE organization_id = ${env.organizationId}
			AND blueprint_id = ${blueprintId}
		ORDER BY reported_at DESC
	`;
	return rows.map(mapInstallReport);
}

export function hashRepoKey(repoKey: RepoKey): string {
	return createHash("sha256").update(stableStringify(repoKey)).digest("hex");
}

async function ensureTypescriptStandardsBlueprint(env: OrgUserEnv) {
	const existing = await getExistingBlueprint("typescript-standards", env);
	if (existing?.currentVersionId) return existing;

	const blueprint = await upsertBlueprint(
		{
			slug: typescriptStandardsBlueprint.slug,
			name: typescriptStandardsBlueprint.name,
		},
		env,
	);
	if (blueprint.currentVersionId) return blueprint;

	const versionId = randomUUID();
	await sqlClient`
		INSERT INTO skill_blueprint_version (
			id,
			blueprint_id,
			organization_id,
			version,
			state,
			payload,
			modules,
			created_by_user_id,
			published_at
		)
		VALUES (
			${versionId},
			${blueprint.id},
			${env.organizationId},
			${typescriptStandardsBlueprint.version},
			'published',
			${JSON.stringify(typescriptStandardsBlueprint)}::jsonb,
			${JSON.stringify(typescriptStandardsModules)}::jsonb,
			${env.userId},
			${new Date()}
		)
	`;
	await sqlClient`
		UPDATE skill_blueprint
		SET current_version_id = ${versionId}, updated_at = ${new Date()}
		WHERE id = ${blueprint.id}
	`;
	return { ...blueprint, currentVersionId: versionId };
}

async function getExistingBlueprint(slug: string, env: OrgUserEnv) {
	const [row] = await sqlClient<Array<SkillBlueprintRow>>`
		SELECT
			id,
			organization_id AS "organizationId",
			slug,
			name,
			current_version_id AS "currentVersionId",
			created_at AS "createdAt",
			updated_at AS "updatedAt"
		FROM skill_blueprint
		WHERE organization_id = ${env.organizationId}
			AND slug = ${slug}
		LIMIT 1
	`;
	return row ?? null;
}

async function upsertBlueprint(
	input: { slug: string; name: string },
	env: OrgUserEnv,
) {
	const [row] = await sqlClient<Array<SkillBlueprintRow>>`
		INSERT INTO skill_blueprint (
			id,
			organization_id,
			slug,
			name
		)
		VALUES (
			${randomUUID()},
			${env.organizationId},
			${input.slug},
			${input.name}
		)
		ON CONFLICT (organization_id, slug)
		DO UPDATE SET
			name = EXCLUDED.name,
			updated_at = ${new Date()}
		RETURNING
			id,
			organization_id AS "organizationId",
			slug,
			name,
			current_version_id AS "currentVersionId",
			created_at AS "createdAt",
			updated_at AS "updatedAt"
	`;
	return expectRow(row, "skill blueprint");
}

async function upsertRepoRegistry(
	repoKey: RepoKey,
	repoKeyHash: string,
	env: OrgUserEnv,
) {
	await sqlClient`
		INSERT INTO repo_registry (
			id,
			organization_id,
			repo_key,
			repo_key_hash,
			first_seen_by_user_id
		)
		VALUES (
			${randomUUID()},
			${env.organizationId},
			${JSON.stringify(repoKey)}::jsonb,
			${repoKeyHash},
			${env.userId}
		)
		ON CONFLICT (organization_id, repo_key_hash)
		DO UPDATE SET last_seen_at = ${new Date()}
	`;
}

function mapBlueprintWithLatest(row: SkillBlueprintWithLatestRow) {
	const value = {
		blueprint: {
			id: row.id,
			organizationId: row.organizationId,
			slug: row.slug,
			name: row.name,
			currentVersionId: row.currentVersionId,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		},
		latestVersion: row.versionId
			? {
					id: row.versionId,
					blueprintId: row.id,
					organizationId: row.organizationId,
					version: row.version ?? "",
					state: row.state ?? "published",
					payload: row.payload,
					modules: row.modules ?? [],
					createdByUserId: row.createdByUserId ?? "",
					createdAt:
						row.versionCreatedAt?.toISOString() ?? row.createdAt.toISOString(),
					publishedAt: row.publishedAt?.toISOString() ?? null,
				}
			: null,
	};
	return SkillBlueprintWithLatestSchema.parse(value);
}

function parseVersionRow(row: SkillBlueprintVersionRow | undefined) {
	if (!row) {
		throw new Error("Expected skill blueprint version row");
	}
	return SkillBlueprintVersionRecordSchema.parse({
		...row,
		createdAt: row.createdAt.toISOString(),
		publishedAt: row.publishedAt?.toISOString() ?? null,
	});
}

function mapRepoOverlay(row: RepoOverlayRow) {
	return {
		...row,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapInstallReport(row: SkillInstallReportRow) {
	return SkillInstallReportRecordSchema.parse({
		...row,
		reportedAt: row.reportedAt.toISOString(),
	});
}

function expectRow<TRow>(row: TRow | undefined, label: string): TRow {
	if (!row) {
		throw new Error(`Expected ${label} row`);
	}
	return row;
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}
	return `{${Object.entries(value)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
		.join(",")}}`;
}

interface SkillBlueprintRow {
	id: string;
	organizationId: string;
	slug: string;
	name: string;
	currentVersionId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

interface SkillBlueprintWithLatestRow extends SkillBlueprintRow {
	versionId: string | null;
	version: string | null;
	state: string | null;
	payload: unknown | null;
	modules: unknown[] | null;
	createdByUserId: string | null;
	versionCreatedAt: Date | null;
	publishedAt: Date | null;
}

interface SkillBlueprintVersionRow {
	id: string;
	blueprintId: string;
	organizationId: string;
	version: string;
	state: string;
	payload: unknown;
	modules: unknown[];
	createdByUserId: string;
	createdAt: Date;
	publishedAt: Date | null;
}

interface RepoOverlayRow {
	id: string;
	organizationId: string;
	repoKey: RepoKey;
	blueprintId: string;
	overlay: RepoOverlayInput["overlay"];
	overlayHash: string;
	updatedByUserId: string;
	updatedAt: Date;
}

interface SkillInstallReportRow extends SkillInstallReportInput {
	id: string;
	organizationId: string;
	reportedByUserId: string;
	reportedAt: Date;
}
