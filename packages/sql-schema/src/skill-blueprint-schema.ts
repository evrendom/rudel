import {
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.js";

export const linkedGithubAccount = pgTable(
	"linked_github_account",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		githubUserId: text("github_user_id").notNull(),
		githubLogin: text("github_login").notNull(),
		primaryEmail: text("primary_email"),
		linkedAt: timestamp("linked_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		userUnique: uniqueIndex("linked_github_account_user_unique").on(
			table.userId,
		),
		githubUserUnique: uniqueIndex(
			"linked_github_account_github_user_unique",
		).on(table.githubUserId),
	}),
);

export const repoRegistry = pgTable(
	"repo_registry",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		repoKey: jsonb("repo_key").notNull(),
		repoKeyHash: text("repo_key_hash").notNull(),
		firstSeenByUserId: text("first_seen_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		firstSeenAt: timestamp("first_seen_at", {
			withTimezone: true,
			mode: "date",
		})
			.defaultNow()
			.notNull(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		orgRepoUnique: uniqueIndex("repo_registry_org_repo_unique").on(
			table.organizationId,
			table.repoKeyHash,
		),
	}),
);

export const skillBlueprint = pgTable(
	"skill_blueprint",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		currentVersionId: text("current_version_id"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		orgSlugUnique: uniqueIndex("skill_blueprint_org_slug_unique").on(
			table.organizationId,
			table.slug,
		),
	}),
);

export const skillBlueprintVersion = pgTable("skill_blueprint_version", {
	id: text("id").primaryKey(),
	blueprintId: text("blueprint_id")
		.notNull()
		.references(() => skillBlueprint.id, { onDelete: "cascade" }),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	version: text("version").notNull(),
	state: text("state").notNull(),
	payload: jsonb("payload").notNull(),
	modules: jsonb("modules").notNull(),
	createdByUserId: text("created_by_user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.defaultNow()
		.notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
});

export const repoOverlay = pgTable(
	"repo_overlay",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		repoKey: jsonb("repo_key").notNull(),
		repoKeyHash: text("repo_key_hash").notNull(),
		blueprintId: text("blueprint_id")
			.notNull()
			.references(() => skillBlueprint.id, { onDelete: "cascade" }),
		overlay: jsonb("overlay").notNull(),
		overlayHash: text("overlay_hash").notNull(),
		updatedByUserId: text("updated_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		orgRepoBlueprintUnique: uniqueIndex(
			"repo_overlay_org_repo_blueprint_unique",
		).on(table.organizationId, table.repoKeyHash, table.blueprintId),
	}),
);

export const skillInstallReport = pgTable(
	"skill_install_report",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		reportedByUserId: text("reported_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		blueprintId: text("blueprint_id")
			.notNull()
			.references(() => skillBlueprint.id, { onDelete: "cascade" }),
		blueprintVersionId: text("blueprint_version_id").notNull(),
		repoKey: jsonb("repo_key").notNull(),
		repoKeyHash: text("repo_key_hash").notNull(),
		artifactTarget: text("artifact_target").notNull(),
		targetPath: text("target_path").notNull(),
		status: text("status").notNull(),
		generatedHash: text("generated_hash").notNull(),
		currentFileHash: text("current_file_hash"),
		overlayHash: text("overlay_hash").notNull(),
		schemaVersion: text("schema_version").notNull(),
		compilerVersion: text("compiler_version").notNull(),
		reportedAt: timestamp("reported_at", { withTimezone: true, mode: "date" })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		orgRepoBlueprintTargetUnique: uniqueIndex(
			"skill_install_report_org_repo_blueprint_target_unique",
		).on(
			table.organizationId,
			table.repoKeyHash,
			table.blueprintId,
			table.artifactTarget,
			table.targetPath,
		),
	}),
);

export type LinkedGithubAccountSelect = typeof linkedGithubAccount.$inferSelect;
export type LinkedGithubAccountInsert = typeof linkedGithubAccount.$inferInsert;
export type RepoRegistrySelect = typeof repoRegistry.$inferSelect;
export type RepoRegistryInsert = typeof repoRegistry.$inferInsert;
export type SkillBlueprintSelect = typeof skillBlueprint.$inferSelect;
export type SkillBlueprintInsert = typeof skillBlueprint.$inferInsert;
export type SkillBlueprintVersionSelect =
	typeof skillBlueprintVersion.$inferSelect;
export type SkillBlueprintVersionInsert =
	typeof skillBlueprintVersion.$inferInsert;
export type RepoOverlaySelect = typeof repoOverlay.$inferSelect;
export type RepoOverlayInsert = typeof repoOverlay.$inferInsert;
export type SkillInstallReportSelect = typeof skillInstallReport.$inferSelect;
export type SkillInstallReportInsert = typeof skillInstallReport.$inferInsert;
