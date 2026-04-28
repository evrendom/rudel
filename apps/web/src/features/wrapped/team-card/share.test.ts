import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { createWrappedTeamCardShareActions } from "@/features/wrapped/team-card/share";
import {
	captureElement,
	copyPngToClipboardWhenReady,
	copyToClipboard,
	downloadAsImage,
} from "@/lib/screenshot";

const {
	mockCaptureElement,
	mockCopyPngToClipboardWhenReady,
	mockCopyToClipboard,
	mockDownloadAsImage,
	mockToastSuccess,
} = vi.hoisted(() => ({
	mockCaptureElement: vi.fn(),
	mockCopyPngToClipboardWhenReady: vi.fn(),
	mockCopyToClipboard: vi.fn(),
	mockDownloadAsImage: vi.fn(),
	mockToastSuccess: vi.fn(),
}));

vi.mock("@/lib/screenshot", () => ({
	captureElement: mockCaptureElement,
	copyPngToClipboardWhenReady: mockCopyPngToClipboardWhenReady,
	copyToClipboard: mockCopyToClipboard,
	downloadAsImage: mockDownloadAsImage,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: mockToastSuccess,
	},
}));

function buildTeamPageMemberRow(
	overrides: Partial<TeamPageMemberRow> = {},
): TeamPageMemberRow {
	return {
		activeDays: 12,
		cost: 42,
		displayName: "Jane Doe",
		email: "jane@example.com",
		favoriteModel: "claude-sonnet",
		hasActivity: true,
		imageUrl: null,
		inputTokens: 120_000,
		lastActiveDate: "2026-04-25",
		outputTokens: 60_000,
		role: "Engineer",
		totalSessions: 18,
		totalTokens: 180_000,
		userId: "user-1",
		...overrides,
	};
}

describe("createWrappedTeamCardShareActions", () => {
	it("captures the team card post at 6K before downloading a 4K PNG", async () => {
		vi.clearAllMocks();
		const imageBlob = new Blob(["png"], { type: "image/png" });
		const sharePostRef = { current: document.createElement("div") };
		vi.mocked(captureElement).mockResolvedValue(imageBlob);

		const actions = createWrappedTeamCardShareActions({
			archetypeLabel: "Maniac",
			displayName: "Jane Doe",
			row: buildTeamPageMemberRow(),
			sharePostRef,
			shareUrlLabel: "rudel.ai/wrapped",
		});

		await actions.handleDownloadPost();

		expect(captureElement).toHaveBeenCalledWith(sharePostRef.current, {
			captureHeight: 6144,
			captureWidth: 6144,
			layoutHeight: 6144,
			layoutWidth: 6144,
			outputHeight: 4096,
			outputWidth: 4096,
			padding: 0,
			pixelRatio: 1,
			style: {
				border: "0",
				borderRadius: "0",
				boxShadow: "none",
				height: "6144px",
				maxWidth: "none",
				width: "6144px",
				"--wrapped-share-preview-body-padding-bottom": "0.56rem",
				"--wrapped-share-preview-body-padding-left": "0.08rem",
				"--wrapped-share-preview-body-padding-right": "0.08rem",
				"--wrapped-share-preview-body-padding-top": "0.45rem",
				"--wrapped-share-preview-card-glare-opacity": "0.2",
				"--wrapped-share-preview-card-shadow-opacity": "0.16",
				"--wrapped-share-preview-card-scale-base": "0.96",
				"--wrapped-share-preview-export-scale": "13.241379",
				"--wrapped-share-preview-meta-font-size": "0.82rem",
				"--wrapped-share-preview-portrait-highlight-blur":
					"calc(var(--wrapped-card-render-scale, 1) * 2.75px)",
				"--wrapped-share-preview-portrait-highlight-y":
					"calc(var(--wrapped-card-render-scale, 1) * 2.25px)",
				"--wrapped-share-preview-portrait-shadow-blur":
					"calc(var(--wrapped-card-render-scale, 1) * 3px)",
				"--wrapped-share-preview-portrait-shadow-y":
					"calc(var(--wrapped-card-render-scale, 1) * -2.5px)",
				"--wrapped-share-preview-shell-padding-bottom": "1.05rem",
				"--wrapped-share-preview-shell-padding-left": "1.15rem",
				"--wrapped-share-preview-shell-padding-right": "1.15rem",
				"--wrapped-share-preview-shell-padding-top": "1.05rem",
				"--wrapped-share-preview-spread-gap": "0.42rem",
				"--wrapped-share-preview-spread-shadow-opacity": "0.14",
				"--wrapped-share-preview-spread-scale-base": "0.72",
				"--wrapped-share-preview-top-gap": "0.625rem",
				"--wrapped-share-preview-top-logo-size": "1rem",
				"--wrapped-team-card-edge-outline-opacity": "0",
				"--wrapped-team-card-edge-top-opacity": "0",
			},
		});
		expect(downloadAsImage).toHaveBeenCalledWith(
			imageBlob,
			"rudel-team-card-post.png",
		);
		expect(toast.success).toHaveBeenCalledWith("Post downloaded");
	});

	it("opens X with first-person copy and only the resolved public card URL", async () => {
		vi.clearAllMocks();
		const imageBlob = new Blob(["png"], { type: "image/png" });
		const open = vi.fn().mockReturnValue({ opener: null });
		const resolveShareUrl = vi
			.fn()
			.mockResolvedValue("https://rudel.ai/wrapped/public-card");
		const sharePostRef = { current: document.createElement("div") };
		Object.defineProperty(window, "open", {
			configurable: true,
			value: open,
		});
		let copiedBlob: Blob | undefined;
		vi.mocked(captureElement).mockResolvedValue(imageBlob);
		vi.mocked(copyPngToClipboardWhenReady).mockImplementation(
			async (imageBlobPromise) => {
				expect(open).not.toHaveBeenCalled();
				copiedBlob = await imageBlobPromise;
				return true;
			},
		);

		const actions = createWrappedTeamCardShareActions({
			archetypeLabel: "Maniac",
			daysSinceFirst: 180,
			distinctProjectCount: 6,
			displayName: "Jane Doe",
			resolveShareUrl,
			row: buildTeamPageMemberRow({
				totalSessions: 219,
				totalTokens: 1_920_000,
			}),
			sharePostRef,
			shareUrlLabel: "rudel.ai/wrapped",
			sourceSplit: [
				{ session_count: 0, session_share_percent: 0, source: "claude_code" },
				{ session_count: 219, session_share_percent: 100, source: "codex" },
			],
		});

		await actions.handleSharePost();

		expect(resolveShareUrl).toHaveBeenCalledTimes(1);
		expect(captureElement).toHaveBeenCalledWith(sharePostRef.current, {
			captureHeight: 3000,
			captureWidth: 3000,
			layoutHeight: 3000,
			layoutWidth: 3000,
			padding: 0,
			pixelRatio: 1,
			style: {
				border: "0",
				borderRadius: "0",
				boxShadow: "none",
				height: "3000px",
				maxWidth: "none",
				width: "3000px",
				"--wrapped-share-preview-body-padding-bottom": "0.56rem",
				"--wrapped-share-preview-body-padding-left": "0.08rem",
				"--wrapped-share-preview-body-padding-right": "0.08rem",
				"--wrapped-share-preview-body-padding-top": "0.45rem",
				"--wrapped-share-preview-card-glare-opacity": "0.2",
				"--wrapped-share-preview-card-shadow-opacity": "0.16",
				"--wrapped-share-preview-card-scale-base": "0.96",
				"--wrapped-share-preview-export-scale": "6.465517",
				"--wrapped-share-preview-meta-font-size": "0.82rem",
				"--wrapped-share-preview-portrait-highlight-blur":
					"calc(var(--wrapped-card-render-scale, 1) * 2.75px)",
				"--wrapped-share-preview-portrait-highlight-y":
					"calc(var(--wrapped-card-render-scale, 1) * 2.25px)",
				"--wrapped-share-preview-portrait-shadow-blur":
					"calc(var(--wrapped-card-render-scale, 1) * 3px)",
				"--wrapped-share-preview-portrait-shadow-y":
					"calc(var(--wrapped-card-render-scale, 1) * -2.5px)",
				"--wrapped-share-preview-shell-padding-bottom": "1.05rem",
				"--wrapped-share-preview-shell-padding-left": "1.15rem",
				"--wrapped-share-preview-shell-padding-right": "1.15rem",
				"--wrapped-share-preview-shell-padding-top": "1.05rem",
				"--wrapped-share-preview-spread-gap": "0.42rem",
				"--wrapped-share-preview-spread-shadow-opacity": "0.14",
				"--wrapped-share-preview-spread-scale-base": "0.72",
				"--wrapped-share-preview-top-gap": "0.625rem",
				"--wrapped-share-preview-top-logo-size": "1rem",
				"--wrapped-team-card-edge-outline-opacity": "0",
				"--wrapped-team-card-edge-top-opacity": "0",
			},
		});
		expect(copyPngToClipboardWhenReady).toHaveBeenCalledWith(
			expect.any(Promise),
		);
		expect(copiedBlob).toBe(imageBlob);
		expect(copyToClipboard).not.toHaveBeenCalled();
		expect(downloadAsImage).not.toHaveBeenCalled();
		expect(open).toHaveBeenCalledTimes(1);
		expect(open).toHaveBeenCalledWith(
			expect.stringContaining("https://twitter.com/intent/tweet"),
			"_blank",
			"noopener,noreferrer",
		);
		const intentUrl = new URL(open.mock.calls[0]?.[0] ?? "");
		expect(intentUrl.searchParams.get("text")).toBe(
			[
				"My Codex usage says I'm a Maniac. Active 12 out of 180 days, 6 repos, 18.3 sessions per active day. Yeah, you should be a little scared.",
				"Check my profile out here https://rudel.ai/wrapped/public-card",
				"[Your image is in your clipboard, pls paste and dont forget]",
			].join("\n\n"),
		);
		expect(intentUrl.searchParams.get("url")).toBeNull();
		expect(toast.success).toHaveBeenCalledWith(
			"Post copied. X is open. Paste the image into the post; your card link is included.",
			{ duration: 7000 },
		);
	});
});
