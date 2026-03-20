import { toPng } from "html-to-image";

const PADDING = 24;

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

export async function captureElement(element: HTMLElement): Promise<Blob> {
	const bg = resolveBackgroundColor(element);
	const dataUrl = await toPng(element, {
		backgroundColor: bg,
		pixelRatio: 2,
	});

	// Draw onto a canvas with padding
	const img = new Image();
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = reject;
		img.src = dataUrl;
	});

	const pad = PADDING * 2; // pixelRatio is already applied in the image
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
