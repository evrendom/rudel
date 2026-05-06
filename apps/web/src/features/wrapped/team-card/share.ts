import type { WrappedSourceSplit } from "@rudel/api-routes";
import type { RefObject } from "react";
import { toast } from "sonner";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { createWrappedImageShareActions } from "@/features/wrapped/share-image";
import { buildWrappedXShareText } from "@/features/wrapped/wrapped-x-share";
import { copyTextToClipboardWithResult } from "@/lib/clipboard";
import { type CaptureElementOptions, captureElement } from "@/lib/screenshot";

const TEAM_CARD_SHARE_IMAGE_FILE_NAME = "rudel-team-card-post.png";
const TEAM_CARD_SHARE_CAPTURE_SIZE = 6144;
const TEAM_CARD_SHARE_CLIPBOARD_CAPTURE_SIZE = 3000;
const TEAM_CARD_SHARE_OUTPUT_SIZE = 4096;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_WIDTH = 2400;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_HEIGHT = 1260;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_OUTPUT_WIDTH = 2400;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_OUTPUT_HEIGHT = 1260;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_FALLBACK_OUTPUT_WIDTH = 1200;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_FALLBACK_OUTPUT_HEIGHT = 630;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const TEAM_CARD_SHARE_REFERENCE_SIZE = 464;
const TEAM_CARD_SHARE_FRONT_CARD_SCALE = 0.96;
const TEAM_CARD_SHARE_SPREAD_CARD_SCALE = 0.72;
const TEAM_CARD_SHARE_SOCIAL_IMAGE_SPREAD_CARD_SCALE = 0.46;
const TEAM_CARD_SHARE_VISIBLE_CAPTURE_OPTIONS =
	buildTeamCardShareCaptureOptions({
		captureSize: TEAM_CARD_SHARE_CLIPBOARD_CAPTURE_SIZE,
	});
const TEAM_CARD_SHARE_IMAGE_CAPTURE_OPTIONS = buildTeamCardShareCaptureOptions({
	captureSize: TEAM_CARD_SHARE_CAPTURE_SIZE,
	outputSize: TEAM_CARD_SHARE_OUTPUT_SIZE,
});
const TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_OPTIONS =
	buildTeamCardShareLandscapeCaptureOptions({
		captureHeight: TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_HEIGHT,
		captureWidth: TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_WIDTH,
		outputHeight: TEAM_CARD_SHARE_SOCIAL_IMAGE_OUTPUT_HEIGHT,
		outputWidth: TEAM_CARD_SHARE_SOCIAL_IMAGE_OUTPUT_WIDTH,
	});
const TEAM_CARD_SHARE_SOCIAL_IMAGE_FALLBACK_CAPTURE_OPTIONS =
	buildTeamCardShareLandscapeCaptureOptions({
		captureHeight: TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_HEIGHT,
		captureWidth: TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_WIDTH,
		outputHeight: TEAM_CARD_SHARE_SOCIAL_IMAGE_FALLBACK_OUTPUT_HEIGHT,
		outputWidth: TEAM_CARD_SHARE_SOCIAL_IMAGE_FALLBACK_OUTPUT_WIDTH,
	});

type WrappedShareActionKind =
	| "copy"
	| "copy_profile_url"
	| "download"
	| "share";

interface CreateWrappedTeamCardShareActionsParams {
	archetypeLabel: string;
	avgSessionMin?: number | null;
	commitRate?: number | null;
	daysSinceFirst?: number;
	distinctProjectCount?: number;
	displayName: string;
	onShareActionTriggered?: (action: WrappedShareActionKind) => void;
	resolveShareUrl?: () => Promise<string | undefined>;
	row: TeamPageMemberRow;
	shareUrl?: string;
	shareUrlLabel: string;
	sharePostRef: RefObject<HTMLDivElement | null>;
	sourceSplit?: readonly WrappedSourceSplit[];
}

interface WrappedTeamCardShareActions {
	handleCopyProfileUrl: () => Promise<boolean>;
	handleCopyPost: () => Promise<boolean>;
	handleDownloadPost: () => Promise<void>;
	handleSharePost: () => Promise<void>;
	shareUrl: string | undefined;
	shareUrlLabel: string;
}

export function createWrappedTeamCardShareActions(
	params: CreateWrappedTeamCardShareActionsParams,
): WrappedTeamCardShareActions {
	const {
		archetypeLabel,
		avgSessionMin,
		commitRate,
		daysSinceFirst,
		distinctProjectCount,
		displayName,
		onShareActionTriggered,
		resolveShareUrl,
		row,
		sharePostRef,
		shareUrl,
		shareUrlLabel,
		sourceSplit,
	} = params;
	const shareTitle = `${displayName}'s Rudel post`;
	const shareText = buildWrappedXShareText({
		activeDays: row.activeDays,
		archetypeLabel,
		avgSessionMin,
		commitRate,
		cost: row.cost,
		daysSinceFirst,
		distinctProjectCount,
		displayName,
		favoriteModel: row.favoriteModel,
		sourceSplit,
		totalSessions: row.totalSessions,
		totalTokens: row.totalTokens,
	});

	const shareActions = createWrappedImageShareActions({
		captureOptions: TEAM_CARD_SHARE_IMAGE_CAPTURE_OPTIONS,
		fileName: TEAM_CARD_SHARE_IMAGE_FILE_NAME,
		imageRef: sharePostRef,
		messages: {
			captureError: "Could not prepare the share image.",
			copyFallbackSuccess:
				"Post copied. Paste it into the app you want to share to.",
			copySuccess: "Post copied to clipboard",
			downloadSuccess: "Post downloaded",
			missingElementError: "Could not find the post to share.",
			shareDownloadSuccess:
				"Post downloaded. Share the PNG from your downloads.",
			shareUrlError:
				"Could not create a share link. Sharing the image without it.",
			xShareCopiedSuccess:
				"Post copied. X is open. Paste the image into the post; your card link is included.",
			xShareDownloadedSuccess:
				"Post downloaded. X is open. Attach the PNG from your downloads.",
		},
		onShareActionTriggered,
		resolveShareUrl,
		shareCaptureOptions: TEAM_CARD_SHARE_VISIBLE_CAPTURE_OPTIONS,
		shareText,
		shareTarget: "x",
		shareTitle,
		shareUrl,
		shareUrlLabel,
	});

	return {
		handleCopyProfileUrl,
		handleCopyPost: shareActions.handleCopyImage,
		handleDownloadPost: shareActions.handleDownloadImage,
		handleSharePost: shareActions.handleShareImage,
		shareUrl: shareActions.shareUrl,
		shareUrlLabel: shareActions.shareUrlLabel,
	};

	async function handleCopyProfileUrl() {
		onShareActionTriggered?.("copy_profile_url");

		let resolvedShareUrl = shareUrl;
		if (!resolvedShareUrl && resolveShareUrl) {
			try {
				resolvedShareUrl = await resolveShareUrl();
			} catch {
				toast.error("Could not create your profile URL. Try again.");
				return false;
			}
		}

		if (!resolvedShareUrl) {
			toast.error("Could not create your profile URL. Try again.");
			return false;
		}

		const copyResult = await copyTextToClipboardWithResult(resolvedShareUrl, {
			allowPromptFallback: true,
			preferSelectionCopy: true,
			promptMessage: "Copy profile URL: Cmd/Ctrl+C, Enter",
		});

		if (copyResult === "failed") {
			toast.error("Could not copy your profile URL. Try again.");
			return false;
		}

		toast.success("Profile URL copied");
		return true;
	}
}

export async function captureWrappedTeamCardSocialImageDataUrl(
	sharePostRef: RefObject<HTMLDivElement | null>,
): Promise<string | undefined> {
	await waitForTeamCardSharePreviewRender();

	const sharePostElement = sharePostRef.current;

	if (!sharePostElement || typeof FileReader === "undefined") {
		return undefined;
	}

	let imageBlob = await captureElement(
		sharePostElement,
		TEAM_CARD_SHARE_SOCIAL_IMAGE_CAPTURE_OPTIONS,
	);

	if (imageBlob.size > TEAM_CARD_SHARE_SOCIAL_IMAGE_MAX_BYTES) {
		imageBlob = await captureElement(
			sharePostElement,
			TEAM_CARD_SHARE_SOCIAL_IMAGE_FALLBACK_CAPTURE_OPTIONS,
		);
	}

	return blobToDataUrl(imageBlob);
}

function formatShareCaptureScale(value: number) {
	return value.toFixed(6).replace(/\.?0+$/, "");
}

function buildTeamCardShareCaptureOptions(options: {
	captureSize: number;
	outputSize?: number;
}): CaptureElementOptions {
	const { captureSize, outputSize } = options;

	return {
		captureHeight: captureSize,
		captureWidth: captureSize,
		layoutHeight: captureSize,
		layoutWidth: captureSize,
		...(outputSize
			? {
					outputHeight: outputSize,
					outputWidth: outputSize,
				}
			: {}),
		padding: 0,
		pixelRatio: 1,
		style: buildTeamCardShareCaptureStyle(captureSize),
	};
}

function buildTeamCardShareLandscapeCaptureOptions(options: {
	captureHeight: number;
	captureWidth: number;
	outputHeight: number;
	outputWidth: number;
}): CaptureElementOptions {
	const { captureHeight, captureWidth, outputHeight, outputWidth } = options;

	return {
		captureHeight,
		captureWidth,
		layoutHeight: captureHeight,
		layoutWidth: captureWidth,
		outputHeight,
		outputWidth,
		padding: 0,
		pixelRatio: 1,
		style: buildTeamCardShareLandscapeCaptureStyle({
			captureHeight,
			captureWidth,
		}),
	};
}

function buildTeamCardShareCaptureStyle(captureSize: number) {
	return {
		border: "0",
		borderRadius: "0",
		boxShadow: "none",
		height: `${captureSize}px`,
		maxWidth: "none",
		width: `${captureSize}px`,
		"--wrapped-share-preview-body-padding-bottom": "0.56rem",
		"--wrapped-share-preview-body-padding-left": "0.08rem",
		"--wrapped-share-preview-body-padding-right": "0.08rem",
		"--wrapped-share-preview-body-padding-top": "0.45rem",
		"--wrapped-share-preview-card-glare-opacity": "0.2",
		"--wrapped-share-preview-card-shadow-opacity": "0.16",
		"--wrapped-share-preview-card-scale-base": formatShareCaptureScale(
			TEAM_CARD_SHARE_FRONT_CARD_SCALE,
		),
		"--wrapped-share-preview-export-scale": formatShareCaptureScale(
			captureSize / TEAM_CARD_SHARE_REFERENCE_SIZE,
		),
		"--wrapped-share-preview-meta-font-size": "0.82rem",
		"--wrapped-share-preview-portrait-highlight-blur":
			"calc(var(--wrapped-card-render-scale, 1) * 2.75px)",
		"--wrapped-share-preview-portrait-highlight-y":
			"calc(var(--wrapped-card-render-scale, 1) * 2.25px)",
		"--wrapped-share-preview-portrait-shadow-blur":
			"calc(var(--wrapped-card-render-scale, 1) * 3px)",
		"--wrapped-share-preview-portrait-shadow-y":
			"calc(var(--wrapped-card-render-scale, 1) * -2.5px)",
		"--wrapped-share-preview-shell-padding-bottom": "1.05rem",
		"--wrapped-share-preview-shell-padding-left": "1.15rem",
		"--wrapped-share-preview-shell-padding-right": "1.15rem",
		"--wrapped-share-preview-shell-padding-top": "1.05rem",
		"--wrapped-share-preview-spread-gap": "0.42rem",
		"--wrapped-share-preview-spread-shadow-opacity": "0.14",
		"--wrapped-share-preview-spread-scale-base": formatShareCaptureScale(
			TEAM_CARD_SHARE_SPREAD_CARD_SCALE,
		),
		"--wrapped-share-preview-top-gap": "0.625rem",
		"--wrapped-share-preview-top-logo-size": "1rem",
		"--wrapped-team-card-edge-outline-opacity": "0",
		"--wrapped-team-card-edge-top-opacity": "0",
	};
}

function buildTeamCardShareLandscapeCaptureStyle(options: {
	captureHeight: number;
	captureWidth: number;
}) {
	const { captureHeight, captureWidth } = options;

	return {
		...buildTeamCardShareCaptureStyle(captureHeight),
		aspectRatio: "40 / 21",
		background: "#fff",
		height: `${captureHeight}px`,
		width: `${captureWidth}px`,
		"--wrapped-share-preview-body-padding-bottom": "0.36rem",
		"--wrapped-share-preview-body-padding-left": "0.08rem",
		"--wrapped-share-preview-body-padding-right": "0.08rem",
		"--wrapped-share-preview-body-padding-top": "0.28rem",
		"--wrapped-share-preview-card-scale-base": "1",
		"--wrapped-share-preview-export-scale": formatShareCaptureScale(
			captureHeight / TEAM_CARD_SHARE_REFERENCE_SIZE,
		),
		"--wrapped-share-preview-meta-font-size": "0.72rem",
		"--wrapped-share-preview-shell-padding-bottom": "0.72rem",
		"--wrapped-share-preview-shell-padding-left": "1.35rem",
		"--wrapped-share-preview-shell-padding-right": "1.35rem",
		"--wrapped-share-preview-shell-padding-top": "0.82rem",
		"--wrapped-share-preview-spread-gap": "0.7rem",
		"--wrapped-share-preview-spread-scale-base": formatShareCaptureScale(
			TEAM_CARD_SHARE_SOCIAL_IMAGE_SPREAD_CARD_SCALE,
		),
		"--wrapped-share-preview-spread-width": "60%",
		"--wrapped-share-preview-top-gap": "0.45rem",
		"--wrapped-share-preview-top-logo-size": "0.92rem",
	};
}

function blobToDataUrl(blob: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();

		reader.onerror = () => {
			reject(reader.error ?? new Error("Failed to read share image"));
		};
		reader.onload = () => {
			if (typeof reader.result !== "string") {
				reject(new Error("Failed to read share image"));
				return;
			}

			resolve(reader.result);
		};
		reader.readAsDataURL(blob);
	});
}

function waitForTeamCardSharePreviewRender() {
	if (typeof window === "undefined" || !window.requestAnimationFrame) {
		return Promise.resolve();
	}

	return new Promise<void>((resolve) => {
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => resolve());
		});
	});
}
