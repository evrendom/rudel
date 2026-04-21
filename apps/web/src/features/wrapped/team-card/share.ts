import type { RefObject } from "react";
import { toast } from "sonner";
import {
	captureElement,
	copyToClipboard,
	downloadAsImage,
} from "@/lib/screenshot";

const TEAM_CARD_SHARE_IMAGE_FILE_NAME = "geneva-team-card-post.png";

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
	const shareTitle = `${displayName}'s Geneva post`;
	const shareText = `${displayName}'s ${archetypeLabel} Geneva card, made with rudel.ai.`;

	return {
		handleCopyPost,
		handleDownloadPost,
		handleSharePost,
		shareUrl,
		shareUrlLabel,
	};

	async function handleSharePost() {
		onShareActionTriggered?.("share");
		const imageBlob = await captureSharePost(sharePostRef);
		const resolvedShareUrl = await getResolvedShareUrl({
			resolveShareUrl,
			shareUrl,
		});

		if (!imageBlob) {
			return;
		}

		const shareFile = new File([imageBlob], TEAM_CARD_SHARE_IMAGE_FILE_NAME, {
			type: imageBlob.type || "image/png",
		});

		if (navigator.share && canShareFiles(shareFile)) {
			try {
				await navigator.share({
					files: [shareFile],
					text: shareText,
					title: shareTitle,
					...(resolvedShareUrl ? { url: resolvedShareUrl } : {}),
				});
				return;
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return;
				}
			}
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success(
				"Post copied. Paste it into the app you want to share to.",
				{
					duration: 7000,
				},
			);
			return;
		}

		downloadAsImage(imageBlob, TEAM_CARD_SHARE_IMAGE_FILE_NAME);
		toast.success("Post downloaded. Share the PNG from your downloads.");
	}

	async function handleCopyPost() {
		onShareActionTriggered?.("copy");
		const imageBlob = await captureSharePost(sharePostRef);

		if (!imageBlob) {
			return;
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success("Post copied to clipboard");
			return;
		}

		toast.error("Could not copy the post. Try downloading it instead.");
	}

	async function handleDownloadPost() {
		onShareActionTriggered?.("download");
		const imageBlob = await captureSharePost(sharePostRef);

		if (!imageBlob) {
			return;
		}

		downloadAsImage(imageBlob, TEAM_CARD_SHARE_IMAGE_FILE_NAME);
		toast.success("Post downloaded");
	}
}

async function getResolvedShareUrl(options: {
	resolveShareUrl?: () => Promise<string | undefined>;
	shareUrl?: string;
}) {
	const { resolveShareUrl, shareUrl } = options;

	if (!resolveShareUrl) {
		return shareUrl;
	}

	try {
		return (await resolveShareUrl()) ?? shareUrl;
	} catch {
		toast.error("Could not create a share link. Sharing the image without it.");
		return shareUrl;
	}
}

async function captureSharePost(
	sharePostRef: RefObject<HTMLDivElement | null>,
): Promise<Blob | null> {
	const sharePostElement = sharePostRef.current;

	if (!sharePostElement) {
		toast.error("Could not find the post to share.");
		return null;
	}

	try {
		return await captureElement(sharePostElement);
	} catch {
		toast.error("Could not prepare the share image.");
		return null;
	}
}

function canShareFiles(shareFile: File) {
	if (!navigator.canShare) {
		return true;
	}

	try {
		return navigator.canShare({ files: [shareFile] });
	} catch {
		return false;
	}
}
