import type { RefObject } from "react";
import { toast } from "sonner";
import {
	type CaptureElementOptions,
	captureElement,
	copyToClipboard,
	downloadAsImage,
} from "@/lib/screenshot";

type WrappedImageShareActionKind = "copy" | "download" | "share";

interface WrappedImageShareMessages {
	captureError: string;
	copyFallbackSuccess: string;
	copySuccess: string;
	downloadSuccess: string;
	missingElementError: string;
	shareDownloadSuccess: string;
	shareUrlError: string;
}

interface CreateWrappedImageShareActionsParams {
	captureOptions?: CaptureElementOptions;
	fileName: string;
	imageRef: RefObject<HTMLDivElement | null>;
	messages?: Partial<WrappedImageShareMessages>;
	onShareActionTriggered?: (action: WrappedImageShareActionKind) => void;
	resolveShareUrl?: () => Promise<string | undefined>;
	shareText: string;
	shareTitle: string;
	shareUrl?: string;
	shareUrlLabel: string;
}

interface WrappedImageShareActions {
	handleCopyImage: () => Promise<void>;
	handleDownloadImage: () => Promise<void>;
	handleShareImage: () => Promise<void>;
	shareUrl: string | undefined;
	shareUrlLabel: string;
}

const DEFAULT_WRAPPED_IMAGE_SHARE_MESSAGES: WrappedImageShareMessages = {
	captureError: "Could not prepare the image.",
	copyFallbackSuccess:
		"Image copied. Paste it into the app you want to share to.",
	copySuccess: "Image copied to clipboard",
	downloadSuccess: "Image downloaded",
	missingElementError: "Could not find the image to share.",
	shareDownloadSuccess: "Image downloaded. Share the PNG from your downloads.",
	shareUrlError: "Could not create a share link. Sharing the image without it.",
};

export function createWrappedImageShareActions(
	params: CreateWrappedImageShareActionsParams,
): WrappedImageShareActions {
	const {
		captureOptions,
		fileName,
		imageRef,
		messages: inputMessages,
		onShareActionTriggered,
		resolveShareUrl,
		shareText,
		shareTitle,
		shareUrl,
		shareUrlLabel,
	} = params;
	const messages = {
		...DEFAULT_WRAPPED_IMAGE_SHARE_MESSAGES,
		...inputMessages,
	};

	return {
		handleCopyImage,
		handleDownloadImage,
		handleShareImage,
		shareUrl,
		shareUrlLabel,
	};

	async function handleShareImage() {
		onShareActionTriggered?.("share");
		const imageBlob = await captureShareImage({
			captureOptions,
			imageRef,
			messages,
		});
		const resolvedShareUrl = await getResolvedShareUrl({
			messages,
			resolveShareUrl,
			shareUrl,
		});

		if (!imageBlob) {
			return;
		}

		const shareFile = new File([imageBlob], fileName, {
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
			toast.success(messages.copyFallbackSuccess, {
				duration: 7000,
			});
			return;
		}

		downloadAsImage(imageBlob, fileName);
		toast.success(messages.shareDownloadSuccess);
	}

	async function handleCopyImage() {
		onShareActionTriggered?.("copy");
		const imageBlob = await captureShareImage({
			captureOptions,
			imageRef,
			messages,
		});

		if (!imageBlob) {
			return;
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success(messages.copySuccess);
			return;
		}

		toast.error("Could not copy the image. Try downloading it instead.");
	}

	async function handleDownloadImage() {
		onShareActionTriggered?.("download");
		const imageBlob = await captureShareImage({
			captureOptions,
			imageRef,
			messages,
		});

		if (!imageBlob) {
			return;
		}

		downloadAsImage(imageBlob, fileName);
		toast.success(messages.downloadSuccess);
	}
}

async function getResolvedShareUrl(options: {
	messages: WrappedImageShareMessages;
	resolveShareUrl?: () => Promise<string | undefined>;
	shareUrl?: string;
}) {
	const { messages, resolveShareUrl, shareUrl } = options;

	if (!resolveShareUrl) {
		return shareUrl;
	}

	try {
		return (await resolveShareUrl()) ?? shareUrl;
	} catch {
		toast.error(messages.shareUrlError);
		return shareUrl;
	}
}

async function captureShareImage(options: {
	captureOptions?: CaptureElementOptions;
	imageRef: RefObject<HTMLDivElement | null>;
	messages: WrappedImageShareMessages;
}): Promise<Blob | null> {
	const { captureOptions, imageRef, messages } = options;
	const imageElement = imageRef.current;

	if (!imageElement) {
		toast.error(messages.missingElementError);
		return null;
	}

	try {
		return await captureElement(imageElement, captureOptions);
	} catch {
		toast.error(messages.captureError);
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
