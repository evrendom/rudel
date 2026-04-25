import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { createWrappedTeamCardShareActions } from "@/features/wrapped/team-card/share";
import { captureElement, downloadAsImage } from "@/lib/screenshot";

const { mockCaptureElement, mockDownloadAsImage, mockToastSuccess } =
	vi.hoisted(() => ({
		mockCaptureElement: vi.fn(),
		mockDownloadAsImage: vi.fn(),
		mockToastSuccess: vi.fn(),
	}));

vi.mock("@/lib/screenshot", () => ({
	captureElement: mockCaptureElement,
	copyToClipboard: vi.fn(),
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
			outputHeight: 4096,
			outputWidth: 4096,
			padding: 0,
			pixelRatio: 1,
			style: {
				border: "0",
				borderRadius: "0",
				boxShadow: "none",
			},
		});
		expect(downloadAsImage).toHaveBeenCalledWith(
			imageBlob,
			"rudel-team-card-post.png",
		);
		expect(toast.success).toHaveBeenCalledWith("Post downloaded");
	});
});
