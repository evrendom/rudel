import { toBlob } from "html-to-image";

const PADDING = 24;
const DEFAULT_PIXEL_RATIO = 2;
const ASSET_READY_TIMEOUT_MS = 3000;
const TRANSPARENT_IMAGE_PLACEHOLDER =
	"data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

export interface CaptureElementOptions {
	padding?: number;
	pixelRatio?: number;
}

function resolveBackgroundColor(element: HTMLElement): string {
	let el: HTMLElement | null = element;
	while (el) {
		const bg = getComputedStyle(el).backgroundColor;
		if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
			return bg;
		}
		el = el.parentElement;
	}
	return "#ffffff";
}

export async function captureElement(
	element: HTMLElement,
	options: CaptureElementOptions = {},
): Promise<Blob> {
	await waitForElementAssets(element);

	const bg = resolveBackgroundColor(element);
	const pixelRatio = options.pixelRatio ?? DEFAULT_PIXEL_RATIO;
	const imageBlob = await toBlob(element, {
		backgroundColor: bg,
		// Official html-to-image options:
		// - cacheBust avoids stale asset fetches during repeated share attempts
		// - imagePlaceholder keeps capture from crashing when an image fetch fails
		// - preferredFontFormat keeps font embedding small and deterministic
		cacheBust: true,
		imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
		pixelRatio,
		preferredFontFormat: "woff2",
	});

	if (!imageBlob) {
		throw new Error("Failed to capture element as image");
	}

	const padding = options.padding ?? PADDING;
	if (padding <= 0) {
		return imageBlob;
	}

	// Draw onto a canvas with padding.
	const img = new Image();
	const imageUrl = URL.createObjectURL(imageBlob);
	try {
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = reject;
			img.src = imageUrl;
		});
	} finally {
		URL.revokeObjectURL(imageUrl);
	}

	const pad = padding * pixelRatio;
	const canvas = document.createElement("canvas");
	canvas.width = img.width + pad * 2;
	canvas.height = img.height + pad * 2;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get canvas context");

	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(img, pad, pad);

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error("Failed to capture element as image"));
		}, "image/png");
	});
}

async function waitForElementAssets(element: HTMLElement) {
	await Promise.race([
		document.fonts?.ready.catch(() => undefined) ?? Promise.resolve(),
		wait(ASSET_READY_TIMEOUT_MS),
	]);

	const images = Array.from(element.querySelectorAll("img"));
	await Promise.all(images.map(waitForImage));

	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}

function waitForImage(image: HTMLImageElement) {
	return new Promise<void>((resolve) => {
		if (image.complete) {
			resolve();
			return;
		}

		const timeoutId = window.setTimeout(finish, ASSET_READY_TIMEOUT_MS);

		function finish() {
			window.clearTimeout(timeoutId);
			image.removeEventListener("load", finish);
			image.removeEventListener("error", finish);
			resolve();
		}

		image.addEventListener("load", finish, { once: true });
		image.addEventListener("error", finish, { once: true });
	});
}

function wait(timeoutMs: number) {
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, timeoutMs);
	});
}

export async function copyToClipboard(blob: Blob): Promise<boolean> {
	try {
		await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
		return true;
	} catch {
		// Safari fallback: ClipboardItem may need a Promise
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					[blob.type]: Promise.resolve(blob),
				}),
			]);
			return true;
		} catch {
			return false;
		}
	}
}

export function downloadAsImage(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function shareToX(text: string) {
	const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
	window.open(url, "_blank", "noopener,noreferrer");
}
