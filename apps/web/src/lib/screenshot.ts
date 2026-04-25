import { toBlob } from "html-to-image";

const PADDING = 24;
const DEFAULT_PIXEL_RATIO = 2;
const ASSET_READY_TIMEOUT_MS = 3000;
const TRANSPARENT_IMAGE_PLACEHOLDER =
	"data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

export interface CaptureElementOptions {
	captureHeight?: number;
	captureWidth?: number;
	outputHeight?: number;
	outputWidth?: number;
	padding?: number;
	pixelRatio?: number;
	style?: Partial<CSSStyleDeclaration>;
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
	const captureCanvasSize = resolveCaptureCanvasSize(element, options);
	const pixelRatio = options.pixelRatio ?? DEFAULT_PIXEL_RATIO;
	const imageBlob = await toBlob(element, {
		backgroundColor: bg,
		canvasHeight: captureCanvasSize?.height,
		canvasWidth: captureCanvasSize?.width,
		// Official html-to-image options:
		// - cacheBust avoids stale asset fetches during repeated share attempts
		// - imagePlaceholder keeps capture from crashing when an image fetch fails
		// - preferredFontFormat keeps font embedding small and deterministic
		cacheBust: true,
		imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
		pixelRatio,
		preferredFontFormat: "woff2",
		style: options.style,
	});

	if (!imageBlob) {
		throw new Error("Failed to capture element as image");
	}

	const outputSize = resolveOutputSize(options);
	const padding = options.padding ?? PADDING;
	if (padding <= 0 && !outputSize) {
		return imageBlob;
	}

	return drawCapturedImage({
		backgroundColor: bg,
		imageBlob,
		outputSize,
		padding,
		pixelRatio,
	});
}

function resolveCaptureCanvasSize(
	element: HTMLElement,
	options: CaptureElementOptions,
) {
	if (!options.captureWidth && !options.captureHeight) {
		return null;
	}

	const elementSize = getElementSize(element);

	if (options.captureWidth && options.captureHeight) {
		return {
			height: options.captureHeight,
			width: options.captureWidth,
		};
	}

	if (options.captureWidth && elementSize.width > 0) {
		return {
			height: Math.round(
				elementSize.height * (options.captureWidth / elementSize.width),
			),
			width: options.captureWidth,
		};
	}

	if (options.captureHeight && elementSize.height > 0) {
		return {
			height: options.captureHeight,
			width: Math.round(
				elementSize.width * (options.captureHeight / elementSize.height),
			),
		};
	}

	return {
		height: options.captureHeight,
		width: options.captureWidth,
	};
}

function getElementSize(element: HTMLElement) {
	const rect = element.getBoundingClientRect();

	return {
		height: rect.height || element.offsetHeight || element.clientHeight,
		width: rect.width || element.offsetWidth || element.clientWidth,
	};
}

function resolveOutputSize(options: CaptureElementOptions) {
	if (!options.outputWidth && !options.outputHeight) {
		return null;
	}

	return {
		height: options.outputHeight,
		width: options.outputWidth,
	};
}

async function drawCapturedImage(options: {
	backgroundColor: string;
	imageBlob: Blob;
	outputSize: { height?: number; width?: number } | null;
	padding: number;
	pixelRatio: number;
}) {
	const { backgroundColor, imageBlob, outputSize, padding, pixelRatio } =
		options;
	const img = await loadImageBlob(imageBlob);
	const pad = Math.max(padding, 0) * pixelRatio;
	const sourceWidth = img.width + pad * 2;
	const sourceHeight = img.height + pad * 2;
	const canvasWidth =
		outputSize?.width ??
		(outputSize?.height
			? Math.round(sourceWidth * (outputSize.height / sourceHeight))
			: sourceWidth);
	const canvasHeight =
		outputSize?.height ??
		(outputSize?.width
			? Math.round(sourceHeight * (outputSize.width / sourceWidth))
			: sourceHeight);
	const scaleX = canvasWidth / sourceWidth;
	const scaleY = canvasHeight / sourceHeight;
	const canvas = document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get canvas context");

	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.fillStyle = backgroundColor;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(
		img,
		pad * scaleX,
		pad * scaleY,
		img.width * scaleX,
		img.height * scaleY,
	);

	return canvasToPngBlob(canvas);
}

async function loadImageBlob(imageBlob: Blob) {
	const img = new Image();
	const imageUrl = URL.createObjectURL(imageBlob);
	try {
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = reject;
			img.src = imageUrl;
		});
		return img;
	} finally {
		URL.revokeObjectURL(imageUrl);
	}
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
	return new Promise<Blob>((resolve, reject) => {
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
