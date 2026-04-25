import type { RefObject } from "react";
import { createWrappedImageShareActions } from "@/features/wrapped/share-image";

const TEAM_CARD_SHARE_IMAGE_FILE_NAME = "rudel-team-card-post.png";

type WrappedShareActionKind = "copy" | "download" | "share";

interface CreateWrappedTeamCardShareActionsParams {
	archetypeLabel: string;
	displayName: string;
	onShareActionTriggered?: (action: WrappedShareActionKind) => void;
	resolveShareUrl?: () => Promise<string | undefined>;
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
		sharePostRef,
		shareUrl,
		shareUrlLabel,
	} = params;
	const shareTitle = `${displayName}'s Rudel post`;
	const shareText = `${displayName}'s ${archetypeLabel} Rudel card, made with rudel.ai.`;

	const shareActions = createWrappedImageShareActions({
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
		},
		onShareActionTriggered,
		resolveShareUrl,
		shareText,
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
