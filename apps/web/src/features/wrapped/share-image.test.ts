import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { createWrappedImageShareActions } from "@/features/wrapped/share-image";
import {
	captureElement,
	copyToClipboard,
	downloadAsImage,
} from "@/lib/screenshot";

const {
	mockCaptureElement,
	mockCopyToClipboard,
	mockDownloadAsImage,
	mockToastError,
	mockToastSuccess,
} = vi.hoisted(() => ({
	mockCaptureElement: vi.fn(),
	mockCopyToClipboard: vi.fn(),
	mockDownloadAsImage: vi.fn(),
	mockToastError: vi.fn(),
	mockToastSuccess: vi.fn(),
}));

vi.mock("@/lib/screenshot", () => ({
	captureElement: mockCaptureElement,
	copyToClipboard: mockCopyToClipboard,
	downloadAsImage: mockDownloadAsImage,
}));

vi.mock("sonner", () => ({
	toast: {
		error: mockToastError,
		success: mockToastSuccess,
	},
}));

function resetShareImageMocks() {
	vi.clearAllMocks();
	Object.defineProperty(navigator, "share", {
		configurable: true,
		value: undefined,
	});
	Object.defineProperty(navigator, "canShare", {
		configurable: true,
		value: undefined,
	});
}

describe("createWrappedImageShareActions", () => {
	it("downloads a captured image with the provided capture options", async () => {
		resetShareImageMocks();
		const blob = new Blob(["png"], { type: "image/png" });
		const imageRef = { current: document.createElement("div") };
		vi.mocked(captureElement).mockResolvedValue(blob);

		const actions = createWrappedImageShareActions({
			captureOptions: { padding: 0, pixelRatio: 4 },
			fileName: "card.png",
			imageRef,
			shareText: "Share text",
			shareTitle: "Share title",
			shareUrlLabel: "rudel.ai/wrapped",
		});

		await actions.handleDownloadImage();

		expect(captureElement).toHaveBeenCalledWith(imageRef.current, {
			padding: 0,
			pixelRatio: 4,
		});
		expect(downloadAsImage).toHaveBeenCalledWith(blob, "card.png");
		expect(toast.success).toHaveBeenCalledWith("Image downloaded");
	});

	it("uses native file share when the browser supports it", async () => {
		resetShareImageMocks();
		const blob = new Blob(["png"], { type: "image/png" });
		const imageRef = { current: document.createElement("div") };
		const share = vi.fn().mockResolvedValue(undefined);
		const canShare = vi.fn().mockReturnValue(true);
		vi.mocked(captureElement).mockResolvedValue(blob);
		Object.defineProperty(navigator, "share", {
			configurable: true,
			value: share,
		});
		Object.defineProperty(navigator, "canShare", {
			configurable: true,
			value: canShare,
		});

		const actions = createWrappedImageShareActions({
			fileName: "card.png",
			imageRef,
			shareText: "Share text",
			shareTitle: "Share title",
			shareUrl: "https://rudel.ai/wrapped",
			shareUrlLabel: "rudel.ai/wrapped",
		});

		await actions.handleShareImage();

		expect(canShare).toHaveBeenCalledWith({
			files: [expect.any(File)],
		});
		expect(share).toHaveBeenCalledWith({
			files: [expect.any(File)],
			text: "Share text",
			title: "Share title",
			url: "https://rudel.ai/wrapped",
		});
		expect(copyToClipboard).not.toHaveBeenCalled();
		expect(downloadAsImage).not.toHaveBeenCalled();
	});

	it("opens an X intent with the share text and URL while preparing the image", async () => {
		resetShareImageMocks();
		const blob = new Blob(["png"], { type: "image/png" });
		const imageRef = { current: document.createElement("div") };
		const pendingXWindow = {
			closed: false,
			close: vi.fn(),
			document: { title: "" },
			location: { href: "" },
			opener: null,
		};
		const open = vi.fn().mockReturnValue(pendingXWindow);
		vi.mocked(captureElement).mockResolvedValue(blob);
		vi.mocked(copyToClipboard).mockResolvedValue(true);
		Object.defineProperty(window, "open", {
			configurable: true,
			value: open,
		});

		const actions = createWrappedImageShareActions({
			fileName: "card.png",
			imageRef,
			shareTarget: "x",
			shareText: "Share text",
			shareTitle: "Share title",
			shareUrl: "https://rudel.ai/wrapped",
			shareUrlLabel: "rudel.ai/wrapped",
		});

		await actions.handleShareImage();

		expect(open).toHaveBeenCalledWith(
			expect.stringContaining("https://twitter.com/intent/tweet"),
			"_blank",
		);
		expect(copyToClipboard).toHaveBeenCalledWith(blob);
		expect(downloadAsImage).not.toHaveBeenCalled();
		const intentUrl = new URL(pendingXWindow.location.href);
		expect(`${intentUrl.origin}${intentUrl.pathname}`).toBe(
			"https://twitter.com/intent/tweet",
		);
		expect(intentUrl.searchParams.get("text")).toBe("Share text");
		expect(intentUrl.searchParams.get("url")).toBe("https://rudel.ai/wrapped");
		expect(toast.success).toHaveBeenCalledWith(
			"Image copied. X is open. Paste the image into the post.",
			{ duration: 7000 },
		);
	});

	it("falls back to clipboard copy when native file share is unavailable", async () => {
		resetShareImageMocks();
		const blob = new Blob(["png"], { type: "image/png" });
		const imageRef = { current: document.createElement("div") };
		vi.mocked(captureElement).mockResolvedValue(blob);
		vi.mocked(copyToClipboard).mockResolvedValue(true);
		Object.defineProperty(navigator, "share", {
			configurable: true,
			value: undefined,
		});
		Object.defineProperty(navigator, "canShare", {
			configurable: true,
			value: undefined,
		});

		const actions = createWrappedImageShareActions({
			fileName: "card.png",
			imageRef,
			shareText: "Share text",
			shareTitle: "Share title",
			shareUrlLabel: "rudel.ai/wrapped",
		});

		await actions.handleShareImage();

		expect(copyToClipboard).toHaveBeenCalledWith(blob);
		expect(downloadAsImage).not.toHaveBeenCalled();
		expect(toast.success).toHaveBeenCalledWith(
			"Image copied. Paste it into the app you want to share to.",
			{ duration: 7000 },
		);
	});

	it("reports a missing export element without trying to capture", async () => {
		resetShareImageMocks();
		const imageRef = { current: null };
		const actions = createWrappedImageShareActions({
			fileName: "card.png",
			imageRef,
			shareText: "Share text",
			shareTitle: "Share title",
			shareUrlLabel: "rudel.ai/wrapped",
		});

		await actions.handleDownloadImage();

		expect(captureElement).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(
			"Could not find the image to share.",
		);
	});
});
