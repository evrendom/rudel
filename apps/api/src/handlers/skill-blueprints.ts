import { ORPCError } from "@orpc/server";
import { orgMiddleware, os } from "../middleware.js";
import {
	getRepoOverlay,
	getSkillBlueprintBySlug,
	listSkillBlueprints,
	listSkillInstallsByBlueprint,
	publishSkillBlueprintDraft,
	reportSkillInstallsBulk,
	saveSkillBlueprintDraft,
	upsertRepoOverlay,
} from "../services/skill-blueprints.service.js";

const list = os.skillBlueprints.list
	.use(orgMiddleware)
	.handler(async ({ context }) => {
		return listSkillBlueprints({
			organizationId: context.organizationId,
			userId: context.user.id,
		});
	});

const getBySlug = os.skillBlueprints.getBySlug
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		return getSkillBlueprintBySlug(input.slug, {
			organizationId: context.organizationId,
			userId: context.user.id,
		});
	});

const saveDraft = os.skillBlueprints.saveDraft
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		return saveSkillBlueprintDraft(input, {
			organizationId: context.organizationId,
			userId: context.user.id,
		});
	});

const publishDraft = os.skillBlueprints.publishDraft
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		const published = await publishSkillBlueprintDraft(input, {
			organizationId: context.organizationId,
			userId: context.user.id,
		});
		if (!published) {
			throw new ORPCError("NOT_FOUND", {
				message: "Draft blueprint version not found",
			});
		}
		return published;
	});

export const skillBlueprintsRouter = os.skillBlueprints.router({
	getBySlug,
	list,
	publishDraft,
	saveDraft,
});

const getOverlay = os.repoOverlays.get
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		return getRepoOverlay(input, {
			organizationId: context.organizationId,
			userId: context.user.id,
		});
	});

const upsertOverlay = os.repoOverlays.upsert
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		return upsertRepoOverlay(input, {
			organizationId: context.organizationId,
			userId: context.user.id,
		});
	});

export const repoOverlaysRouter = os.repoOverlays.router({
	get: getOverlay,
	upsert: upsertOverlay,
});

const reportBulk = os.skillInstalls.reportBulk
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		return reportSkillInstallsBulk(input.reports, {
			organizationId: context.organizationId,
			userId: context.user.id,
		});
	});

const listByBlueprint = os.skillInstalls.listByBlueprint
	.use(orgMiddleware)
	.handler(async ({ context, input }) => {
		return listSkillInstallsByBlueprint(input.blueprintId, {
			organizationId: context.organizationId,
			userId: context.user.id,
		});
	});

export const skillInstallsRouter = os.skillInstalls.router({
	listByBlueprint,
	reportBulk,
});
