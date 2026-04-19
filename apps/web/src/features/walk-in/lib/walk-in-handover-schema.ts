import { WrappedV1Schema } from "@rudel/api-routes";
import { z } from "zod";

export const WalkInCallToActionKindSchema = z.enum([
	"share-x",
	"share-linkedin",
	"follow-x",
]);

export const WalkInCallToActionSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	kind: WalkInCallToActionKindSchema,
});

export const WalkInMetricCandidateStatusSchema = z.enum([
	"planned",
	"available",
	"blocked",
]);

export const WalkInMetricCandidateOwnerSchema = z.enum([
	"product",
	"data",
	"render",
]);

export const WalkInMetricCandidateSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	status: WalkInMetricCandidateStatusSchema,
	owner: WalkInMetricCandidateOwnerSchema,
	notes: z.string().nullable(),
});

export const WalkInHudSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
});

export const WalkInCanvasSchema = z.object({
	aspectRatioLabel: z.literal("9:16"),
	maxPreviewWidthPx: z.number().int().positive(),
	backgroundHex: z.string().regex(/^#([0-9A-Fa-f]{6})$/),
	cornerRadiusPx: z.number().int().nonnegative(),
});

export const WalkInProfileSchema = z.object({
	avatarSrc: z.string().min(1),
	fallbackLabel: z.string().min(1),
});

export const WalkInPreviewSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	termsLabel: z.string().min(1),
	hud: WalkInHudSchema,
	canvas: WalkInCanvasSchema,
	profile: WalkInProfileSchema,
	callToActions: z.array(WalkInCallToActionSchema).min(1),
	metricCandidates: z.array(WalkInMetricCandidateSchema).min(1),
});

export const WalkInStoryBeatSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	goal: z.string().min(1),
});

const WalkInPreviewRenderTargetSchema = z.object({
	kind: z.literal("preview"),
	id: z.literal("web-preview"),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const WalkInImageRenderTargetSchema = z.object({
	kind: z.literal("image"),
	id: z.literal("share-card"),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const WalkInVideoRenderTargetSchema = z.object({
	kind: z.literal("video"),
	id: z.literal("story-video"),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	fps: z.number().int().positive(),
});

export const WalkInRenderTargetSchema = z.discriminatedUnion("kind", [
	WalkInPreviewRenderTargetSchema,
	WalkInImageRenderTargetSchema,
	WalkInVideoRenderTargetSchema,
]);

export const WalkInRenderStrategySchema = z.enum([
	"browser-preview",
	"remotion-compatible",
]);

export const WalkInRenderPlanSchema = z.object({
	strategy: WalkInRenderStrategySchema,
	storyBeats: z.array(WalkInStoryBeatSchema).min(1),
	targets: z.array(WalkInRenderTargetSchema).min(1),
	handoffGoals: z.array(z.string().min(1)).min(1),
});

export const WalkInWrappedDataStateSchema = z.enum([
	"seed",
	"loading",
	"live",
	"error",
]);

export const WalkInWrappedDataSchema = z.object({
	data: WrappedV1Schema.nullable(),
	state: WalkInWrappedDataStateSchema,
});

export const WalkInHandoverSchema = z.object({
	version: z.literal("1"),
	preview: WalkInPreviewSchema,
	renderPlan: WalkInRenderPlanSchema,
	wrapped: WalkInWrappedDataSchema,
});

export type WalkInCallToAction = z.infer<typeof WalkInCallToActionSchema>;
export type WalkInMetricCandidate = z.infer<typeof WalkInMetricCandidateSchema>;
export type WalkInPreview = z.infer<typeof WalkInPreviewSchema>;
export type WalkInStoryBeat = z.infer<typeof WalkInStoryBeatSchema>;
export type WalkInRenderTarget = z.infer<typeof WalkInRenderTargetSchema>;
export type WalkInRenderPlan = z.infer<typeof WalkInRenderPlanSchema>;
export type WalkInWrappedDataState = z.infer<
	typeof WalkInWrappedDataStateSchema
>;
export type WalkInWrappedData = z.infer<typeof WalkInWrappedDataSchema>;
export type WalkInHandover = z.infer<typeof WalkInHandoverSchema>;
