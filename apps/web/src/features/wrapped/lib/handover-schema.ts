import { WrappedV1Schema } from "@rudel/api-routes";
import { z } from "zod";

export const WrappedCallToActionKindSchema = z.enum([
	"share-x",
	"share-linkedin",
	"follow-x",
]);

export const WrappedCallToActionSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	kind: WrappedCallToActionKindSchema,
});

export const WrappedMetricCandidateStatusSchema = z.enum([
	"planned",
	"available",
	"blocked",
]);

export const WrappedMetricCandidateOwnerSchema = z.enum([
	"product",
	"data",
	"render",
]);

export const WrappedMetricCandidateSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	status: WrappedMetricCandidateStatusSchema,
	owner: WrappedMetricCandidateOwnerSchema,
	notes: z.string().nullable(),
});

export const WrappedHudSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
});

export const WrappedCanvasSchema = z.object({
	aspectRatioLabel: z.literal("9:16"),
	maxPreviewWidthPx: z.number().int().positive(),
	backgroundHex: z.string().regex(/^#([0-9A-Fa-f]{6})$/),
	cornerRadiusPx: z.number().int().nonnegative(),
});

export const WrappedProfileSchema = z.object({
	avatarSrc: z.string().min(1),
	fallbackLabel: z.string().min(1),
});

export const WrappedPreviewSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	termsLabel: z.string().min(1),
	hud: WrappedHudSchema,
	canvas: WrappedCanvasSchema,
	profile: WrappedProfileSchema,
	callToActions: z.array(WrappedCallToActionSchema).min(1),
	metricCandidates: z.array(WrappedMetricCandidateSchema).min(1),
});

export const WrappedStoryBeatSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	goal: z.string().min(1),
});

const WrappedPreviewRenderTargetSchema = z.object({
	kind: z.literal("preview"),
	id: z.literal("web-preview"),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const WrappedImageRenderTargetSchema = z.object({
	kind: z.literal("image"),
	id: z.literal("share-card"),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

const WrappedVideoRenderTargetSchema = z.object({
	kind: z.literal("video"),
	id: z.literal("story-video"),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	fps: z.number().int().positive(),
});

export const WrappedRenderTargetSchema = z.discriminatedUnion("kind", [
	WrappedPreviewRenderTargetSchema,
	WrappedImageRenderTargetSchema,
	WrappedVideoRenderTargetSchema,
]);

export const WrappedRenderStrategySchema = z.enum([
	"browser-preview",
	"remotion-compatible",
]);

export const WrappedRenderPlanSchema = z.object({
	strategy: WrappedRenderStrategySchema,
	storyBeats: z.array(WrappedStoryBeatSchema).min(1),
	targets: z.array(WrappedRenderTargetSchema).min(1),
	handoffGoals: z.array(z.string().min(1)).min(1),
});

export const WrappedDataStateSchema = z.enum([
	"seed",
	"loading",
	"live",
	"error",
]);

export const WrappedDataSchema = z.object({
	data: WrappedV1Schema.nullable(),
	state: WrappedDataStateSchema,
});

export const WrappedHandoverSchema = z.object({
	version: z.literal("1"),
	preview: WrappedPreviewSchema,
	renderPlan: WrappedRenderPlanSchema,
	wrapped: WrappedDataSchema,
});

export type WrappedCallToAction = z.infer<typeof WrappedCallToActionSchema>;
export type WrappedMetricCandidate = z.infer<
	typeof WrappedMetricCandidateSchema
>;
export type WrappedPreview = z.infer<typeof WrappedPreviewSchema>;
export type WrappedStoryBeat = z.infer<typeof WrappedStoryBeatSchema>;
export type WrappedRenderTarget = z.infer<typeof WrappedRenderTargetSchema>;
export type WrappedRenderPlan = z.infer<typeof WrappedRenderPlanSchema>;
export type WrappedDataState = z.infer<typeof WrappedDataStateSchema>;
export type WrappedData = z.infer<typeof WrappedDataSchema>;
export type WrappedHandover = z.infer<typeof WrappedHandoverSchema>;
