import type { RefObject } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { createWrappedImageShareActions } from "@/features/wrapped/share-image";
import { buildWrappedXShareText } from "@/features/wrapped/wrapped-x-share";

const TEAM_CARD_SHARE_IMAGE_FILE_NAME = "rudel-team-card-post.png";
const TEAM_CARD_SHARE_CAPTURE_SIZE = 6144;
const TEAM_CARD_SHARE_OUTPUT_SIZE = 4096;
const TEAM_CARD_SHARE_IMAGE_CAPTURE_OPTIONS = {
	captureHeight: TEAM_CARD_SHARE_CAPTURE_SIZE,
	captureWidth: TEAM_CARD_SHARE_CAPTURE_SIZE,
	outputHeight: TEAM_CARD_SHARE_OUTPUT_SIZE,
	outputWidth: TEAM_CARD_SHARE_OUTPUT_SIZE,
	padding: 0,
	pixelRatio: 1,
	style: {
		border: "0",
		borderRadius: "0",
		boxShadow: "none",
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
	} = params;
	const shareTitle = `${displayName}'s Rudel post`;
	const shareText = buildWrappedXShareText({
		archetypeLabel,
		displayName,
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
		},
		onShareActionTriggered,
		resolveShareUrl,
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
