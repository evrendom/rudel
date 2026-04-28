import type { WrappedSourceSplit } from "@rudel/api-routes";
import type { RefObject } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { createWrappedImageShareActions } from "@/features/wrapped/share-image";
import { buildWrappedXShareText } from "@/features/wrapped/wrapped-x-share";
import type { CaptureElementOptions } from "@/lib/screenshot";

const TEAM_CARD_SHARE_IMAGE_FILE_NAME = "rudel-team-card-post.png";
const TEAM_CARD_SHARE_CAPTURE_SIZE = 6144;
const TEAM_CARD_SHARE_CLIPBOARD_CAPTURE_SIZE = 3000;
const TEAM_CARD_SHARE_OUTPUT_SIZE = 4096;
const TEAM_CARD_SHARE_REFERENCE_SIZE = 464;
const TEAM_CARD_SHARE_FRONT_CARD_SCALE = 0.96;
const TEAM_CARD_SHARE_SPREAD_CARD_SCALE = 0.72;
const TEAM_CARD_SHARE_VISIBLE_CAPTURE_OPTIONS =
	buildTeamCardShareCaptureOptions({
		captureSize: TEAM_CARD_SHARE_CLIPBOARD_CAPTURE_SIZE,
	});
const TEAM_CARD_SHARE_IMAGE_CAPTURE_OPTIONS = buildTeamCardShareCaptureOptions({
	captureSize: TEAM_CARD_SHARE_CAPTURE_SIZE,
	outputSize: TEAM_CARD_SHARE_OUTPUT_SIZE,
});

type WrappedShareActionKind = "copy" | "download" | "share";

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
	handleCopyPost: () => Promise<void>;
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
		handleCopyPost: shareActions.handleCopyImage,
		handleDownloadPost: shareActions.handleDownloadImage,
		handleSharePost: shareActions.handleShareImage,
		shareUrl: shareActions.shareUrl,
		shareUrlLabel: shareActions.shareUrlLabel,
	};
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
