import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";

const {
	mockTrackNavigation,
	mockTrackUtilityUsed,
	mockTrackWrappedShareActionTriggered,
	mockTrackWrappedShareCreated,
	mockTrackWrappedStoryStarted,
} = vi.hoisted(() => ({
	mockTrackNavigation: vi.fn(),
	mockTrackUtilityUsed: vi.fn(),
	mockTrackWrappedShareActionTriggered: vi.fn(),
	mockTrackWrappedShareCreated: vi.fn(),
	mockTrackWrappedStoryStarted: vi.fn(),
}));

vi.mock("dialkit", () => ({
	useDialKit: () => ({
		card: {
			grainOpacity: 0,
		},
		statLayers: {
			borderOpacity: 1,
			fillOpacity: 0,
			insetShadowOpacity: 0,
			shineOpacity: 0,
			textureOpacity: 0,
			topStrokeOpacity: 0,
		},
	}),
}));

vi.mock("motion/react", () => {
	const MotionDiv = ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	);

	return {
		AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
		motion: {
			div: MotionDiv,
		},
		useReducedMotion: () => true,
	};
});

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackNavigation: mockTrackNavigation,
		trackUtilityUsed: mockTrackUtilityUsed,
		trackWrappedShareActionTriggered: mockTrackWrappedShareActionTriggered,
		trackWrappedShareCreated: mockTrackWrappedShareCreated,
		trackWrappedStoryStarted: mockTrackWrappedStoryStarted,
	}),
}));

vi.mock("@/features/wrapped/entry", () => ({
	markWrappedCompleted: vi.fn(),
}));

vi.mock("@/features/wrapped/onboarding/shell", () => ({
	WrappedTeamCardOnboarding: ({ finalStage }: { finalStage: ReactNode }) => (
		<div>{finalStage}</div>
	),
}));

vi.mock("@/features/wrapped/team-card/card", () => ({
	WrappedTeamMemberCard: () => <div>Wrapped member card</div>,
}));

vi.mock("@/features/wrapped/team-card/final-stages", () => ({
	WrappedTeamCardRevealStage: ({
		onPreviewPost,
	}: {
		onPreviewPost: () => void;
	}) => (
		<button type="button" onClick={onPreviewPost}>
			Preview post
		</button>
	),
	WrappedTeamCardShareStage: ({
		onCopy,
		onDownload,
		onShare,
	}: {
		onCopy: () => void;
		onDownload: () => void;
		onShare: () => void;
	}) => (
		<div>
			<button type="button" onClick={onCopy}>
				Copy post
			</button>
			<button type="button" onClick={onDownload}>
				Download post
			</button>
			<button type="button" onClick={onShare}>
				Share post
			</button>
		</div>
	),
}));

vi.mock("@/features/wrapped/team-card/share", () => ({
	createWrappedTeamCardShareActions: (params: {
		onShareActionTriggered?: (action: "copy" | "download" | "share") => void;
		resolveShareUrl?: () => Promise<string | undefined>;
		shareUrl?: string;
		shareUrlLabel: string;
	}) => ({
		handleCopyPost: async () => {
			params.onShareActionTriggered?.("copy");
		},
		handleDownloadPost: async () => {
			params.onShareActionTriggered?.("download");
		},
		handleSharePost: async () => {
			params.onShareActionTriggered?.("share");
			await params.resolveShareUrl?.();
		},
		shareUrl: params.shareUrl,
		shareUrlLabel: params.shareUrlLabel,
	}),
}));

vi.mock("@/features/wrapped/team-card/tilt/use-card-tilt", () => ({
	useWrappedCardTilt: () => ({}),
}));

vi.mock("@/features/wrapped/team-card/use-share", () => ({
	useWrappedTeamCardShare: (
		_snapshot: unknown,
		options?: {
			onShareCreated?: (shareRecord: { id: string }) => void;
		},
	) => ({
		ensureShare: async () => {
			const shareRecord = { id: "created-share-1" };
			options?.onShareCreated?.(shareRecord);
			return shareRecord;
		},
		isCreatingShare: false,
		shareUrl: undefined,
		shareUrlLabel: "/wrapped",
	}),
}));

vi.mock("@/features/wrapped/team-card/use-page-data", () => ({
	useWrappedTeamCardPageData: () => ({
		completionUserId: "user-1",
		liveArchetype: {
			classifierKey: "roadrunner",
			displayLabel: "Roadrunner",
			id: "roadrunner",
			kind: "taxonomy",
			shellClassName: "team-lineup-shell",
			theme: "light",
		},
		onboardingMetrics: {
			activeDays: 6,
			avgSessionMin: 12,
			commitRate: 50,
			commitSessions: 6,
			daysSinceFirst: 10,
			distinctProjectCount: 3,
			estimatedCostTokenBasis: 1200,
			estimatedCostUsd: 42,
			favoriteModel: "o3",
			longestSessionMin: 44,
			modelByMonth: [],
			repoPulse: {
				entries: [],
				leadRepoName: null,
				totalRepos: 3,
				totalSessions: 12,
			},
			sourceSplit: [],
			skillsAdoptionRate: 10,
			slashCommandsAdoptionRate: 20,
			subagentsAdoptionRate: 30,
			successRate: 80,
			topProjectName: null,
			topProjectSessions: 0,
			topProjectTokens: 0,
			topSkills: [],
			topSlashCommand: null,
			topSlashCommandCount: null,
			topSlashCommands: [],
			topSubagent: null,
			topSubagentCount: null,
			topSubagents: [],
			totalSessions: 12,
			totalTokens: 360,
		},
		publicUsername: "ada",
		statItems: [],
		visibleTeamCardRow: {
			activeDays: 6,
			cost: 42,
			displayName: "Ada",
			email: "ada@example.com",
			favoriteModel: "o3",
			hasActivity: true,
			imageUrl: null,
			inputTokens: 120,
			lastActiveDate: "2026-04-22",
			outputTokens: 240,
			role: "Builder",
			totalSessions: 12,
			totalTokens: 360,
			userId: "user-1",
		},
	}),
}));

describe("WrappedTeamCardPage analytics", () => {
	beforeEach(() => {
		mockTrackNavigation.mockReset();
		mockTrackUtilityUsed.mockReset();
		mockTrackWrappedShareActionTriggered.mockReset();
		mockTrackWrappedShareCreated.mockReset();
		mockTrackWrappedStoryStarted.mockReset();
	});

	it("tracks story start, share creation, and distribution from a source share", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped?share_id=source-share-1"]}>
				<WrappedTeamCardPage />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(mockTrackWrappedStoryStarted).toHaveBeenCalledWith({
				activationState: "story",
				entrySource: "share_redirect",
				sourceComponent: "wrapped_team_card_page",
				sourceShareId: "source-share-1",
			});
		});

		await user.click(screen.getByRole("button", { name: "Preview post" }));
		await user.click(await screen.findByRole("button", { name: "Share post" }));

		await waitFor(() => {
			expect(mockTrackWrappedShareActionTriggered).toHaveBeenCalledWith({
				activationState: "share",
				entrySource: "share_redirect",
				shareAction: "share",
				sourceComponent: "wrapped_share_actions",
				sourceShareId: "source-share-1",
			});
		});
		await waitFor(() => {
			expect(mockTrackWrappedShareCreated).toHaveBeenCalledWith(
				expect.objectContaining({
					archetypeId: "roadrunner",
					entrySource: "share_redirect",
					shareId: "created-share-1",
					sourceComponent: "wrapped_team_card_page",
					sourceShareId: "source-share-1",
				}),
			);
		});
	});
});
