import type { WrappedSourceSplit } from "@rudel/api-routes";
import type { RefObject } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { createWrappedImageShareActions } from "@/features/wrapped/share-image";
import {
	buildWrappedXShareText,
	WRAPPED_X_MAKE_YOURS_URL,
} from "@/features/wrapped/wrapped-x-share";

const TEAM_CARD_SHARE_IMAGE_FILE_NAME = "rudel-team-card-post.png";
const TEAM_CARD_SHARE_CAPTURE_SIZE = 6144;
const TEAM_CARD_SHARE_OUTPUT_SIZE = 4096;
const TEAM_CARD_SHARE_REFERENCE_SIZE = 464;
const TEAM_CARD_SHARE_EXPORT_SCALE =
	TEAM_CARD_SHARE_CAPTURE_SIZE / TEAM_CARD_SHARE_REFERENCE_SIZE;
const TEAM_CARD_SHARE_EXPORT_FRONT_CARD_SCALE =
	0.96 * TEAM_CARD_SHARE_EXPORT_SCALE;
const TEAM_CARD_SHARE_EXPORT_SPREAD_CARD_SCALE =
	0.72 * TEAM_CARD_SHARE_EXPORT_SCALE;
const TEAM_CARD_SHARE_IMAGE_CAPTURE_OPTIONS = {
	captureHeight: TEAM_CARD_SHARE_CAPTURE_SIZE,
	captureWidth: TEAM_CARD_SHARE_CAPTURE_SIZE,
	layoutHeight: TEAM_CARD_SHARE_CAPTURE_SIZE,
	layoutWidth: TEAM_CARD_SHARE_CAPTURE_SIZE,
	outputHeight: TEAM_CARD_SHARE_OUTPUT_SIZE,
	outputWidth: TEAM_CARD_SHARE_OUTPUT_SIZE,
	padding: 0,
	pixelRatio: 1,
	style: {
		border: "0",
		borderRadius: "0",
		boxShadow: "none",
		height: `${TEAM_CARD_SHARE_CAPTURE_SIZE}px`,
		maxWidth: "none",
		width: `${TEAM_CARD_SHARE_CAPTURE_SIZE}px`,
		"--wrapped-share-preview-body-padding-bottom": "0.56rem",
		"--wrapped-share-preview-body-padding-left": "0.08rem",
		"--wrapped-share-preview-body-padding-right": "0.08rem",
		"--wrapped-share-preview-body-padding-top": "0.45rem",
		"--wrapped-share-preview-card-glare-opacity": "0.2",
		"--wrapped-share-preview-card-shadow-opacity": "0.16",
		"--wrapped-share-preview-card-scale-base": formatShareCaptureScale(
			TEAM_CARD_SHARE_EXPORT_FRONT_CARD_SCALE,
		),
		"--wrapped-share-preview-card-scale": formatShareCaptureScale(
			TEAM_CARD_SHARE_EXPORT_FRONT_CARD_SCALE,
		),
		"--wrapped-share-preview-export-scale": formatShareCaptureScale(
			TEAM_CARD_SHARE_EXPORT_SCALE,
		),
		"--wrapped-share-preview-meta-font-size": "0.82rem",
		"--wrapped-share-preview-shell-padding-bottom": "1rem",
		"--wrapped-share-preview-shell-padding-left": "1.15rem",
		"--wrapped-share-preview-shell-padding-right": "1.15rem",
		"--wrapped-share-preview-shell-padding-top": "1.05rem",
		"--wrapped-share-preview-spread-gap": "0.42rem",
		"--wrapped-share-preview-spread-shadow-opacity": "0.14",
		"--wrapped-share-preview-spread-scale-base": formatShareCaptureScale(
			TEAM_CARD_SHARE_EXPORT_SPREAD_CARD_SCALE,
		),
		"--wrapped-share-preview-spread-scale": formatShareCaptureScale(
			TEAM_CARD_SHARE_EXPORT_SPREAD_CARD_SCALE,
		),
		"--wrapped-share-preview-top-gap": "0.625rem",
		"--wrapped-share-preview-top-logo-size": "1rem",
	},
};

type WrappedShareActionKind = "copy" | "download" | "share";

interface CreateWrappedTeamCardShareActionsParams {
	archetypeLabel: string;
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
		archetypeLabel,
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
				"Post copied. X is open. Paste the image into the post.",
			xShareDownloadedSuccess:
				"Post downloaded. X is open. Attach the PNG from your downloads.",
			xShareReadySuccess: "X is open with your Rudel Wrapped post preview.",
		},
		onShareActionTriggered,
		resolveShareUrl,
		shareText,
		shareTarget: "x",
		shareTitle,
		shareUrl: shareUrl ?? WRAPPED_X_MAKE_YOURS_URL,
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
