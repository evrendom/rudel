import type { RefObject } from "react";
import { toast } from "sonner";
import {
	type CaptureElementOptions,
	captureElement,
	copyPngToClipboardWhenReady,
	copyToClipboard,
	downloadAsImage,
} from "@/lib/screenshot";
import { buildWrappedXIntentUrl } from "./wrapped-x-share";

type WrappedImageShareActionKind = "copy" | "download" | "share";
type WrappedImageShareTarget = "system" | "x";

interface WrappedImageShareMessages {
	captureError: string;
	copyFallbackSuccess: string;
	copySuccess: string;
	downloadSuccess: string;
	missingElementError: string;
	shareDownloadSuccess: string;
	shareUrlError: string;
	xShareCopiedSuccess: string;
	xShareDownloadedSuccess: string;
}

interface CreateWrappedImageShareActionsParams {
	captureOptions?: CaptureElementOptions;
	fileName: string;
	imageRef: RefObject<HTMLDivElement | null>;
	messages?: Partial<WrappedImageShareMessages>;
	onShareActionTriggered?: (action: WrappedImageShareActionKind) => void;
	resolveShareUrl?: () => Promise<string | undefined>;
	shareCaptureOptions?: CaptureElementOptions;
	shareText: string;
	shareTarget?: WrappedImageShareTarget;
	shareTitle: string;
	shareUrl?: string;
	shareUrlLabel: string;
}

interface WrappedImageShareActions {
	handleCopyImage: () => Promise<boolean>;
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
	xShareCopiedSuccess:
		"Image copied. X is open. Paste the image into the post; your card link is included.",
	xShareDownloadedSuccess:
		"Image downloaded. X is open. Attach the PNG from your downloads.",
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
		shareCaptureOptions,
		shareText,
		shareTarget = "system",
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

		if (shareTarget === "x") {
			await handleShareImageToX();
			return;
		}

		const imageBlob = await captureShareImage({
			captureOptions: shareCaptureOptions ?? captureOptions,
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

	async function handleShareImageToX() {
		const imageBlobPromise = requireCapturedShareImage(
			captureShareImage({
				captureOptions: shareCaptureOptions ?? captureOptions,
				imageRef,
				messages,
			}),
		);
		const [imageBlob, copied, resolvedShareUrl] = await Promise.all([
			imageBlobPromise.catch(() => null),
			copyPngToClipboardWhenReady(imageBlobPromise),
			getResolvedShareUrl({
				messages,
				resolveShareUrl,
				shareUrl,
			}),
		]);

		if (!imageBlob) {
			return;
		}

		if (!copied) {
			downloadAsImage(imageBlob, fileName);
			toast.success(messages.shareDownloadSuccess, {
				duration: 7000,
			});
			return;
		}

		const didOpenX = openXIntentWindow(
			buildWrappedXIntentUrl({
				text: shareText,
				url: resolvedShareUrl ?? shareUrl,
			}),
		);

		toast.success(
			didOpenX ? messages.xShareCopiedSuccess : messages.copyFallbackSuccess,
			{
				duration: 7000,
			},
		);
	}

	async function handleCopyImage(): Promise<boolean> {
		onShareActionTriggered?.("copy");
		const imageBlob = await captureShareImage({
			captureOptions,
			imageRef,
			messages,
		});

		if (!imageBlob) {
			return false;
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success(messages.copySuccess);
			return true;
		}

		toast.error("Could not copy the image. Try downloading it instead.");
		return false;
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

async function requireCapturedShareImage(
	imageBlobPromise: Promise<Blob | null>,
): Promise<Blob> {
	const imageBlob = await imageBlobPromise;

	if (!imageBlob) {
		throw new Error("Missing share image");
	}

	return imageBlob;
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
	await waitForCurrentRender();

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

function waitForCurrentRender() {
	if (typeof window === "undefined" || !window.requestAnimationFrame) {
		return Promise.resolve();
	}

	return new Promise<void>((resolve) => {
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => resolve());
		});
	});
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

function openXIntentWindow(xIntentUrl: string) {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		const xWindow = window.open(xIntentUrl, "_blank", "noopener,noreferrer");

		if (xWindow) {
			xWindow.opener = null;
			return true;
		}
	} catch {}

	return false;
}
