import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedPublicPage } from "@/features/wrapped/WrappedPublicPage";

const { mockUseSession, mockUseWrappedPublicPage, mockTrackUtilityUsed } =
	vi.hoisted(() => ({
		mockUseSession: vi.fn(),
		mockUseWrappedPublicPage: vi.fn(),
		mockTrackUtilityUsed: vi.fn(),
	}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: mockUseSession,
	},
}));

vi.mock("@/features/wrapped/use-wrapped-public-page", () => ({
	useWrappedPublicPage: mockUseWrappedPublicPage,
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackUtilityUsed: mockTrackUtilityUsed,
	}),
}));

vi.mock("@/features/wrapped/WrappedPublicCardScreen", () => ({
	WrappedPublicCardAction: ({
		children,
		href,
		onClick,
	}: {
		children: ReactNode;
		href: string;
		onClick?: () => void;
	}) => (
		<a href={href} onClick={onClick}>
			{children}
		</a>
	),
	WrappedPublicCardScreen: ({
		action,
		activeArchetype,
		row,
	}: {
		action: ReactNode;
		activeArchetype: { displayLabel: string };
		row: { displayName: string };
	}) => (
		<div>
			<h1>{`${row.displayName} is a ${activeArchetype.displayLabel}`}</h1>
			{action}
		</div>
	),
}));

describe("WrappedPublicPage", () => {
	beforeEach(() => {
		mockTrackUtilityUsed.mockReset();
		mockUseSession.mockReset();
		mockUseWrappedPublicPage.mockReset();

		mockUseSession.mockReturnValue({ data: null });
		mockUseWrappedPublicPage.mockReturnValue({
			data: {
				created_at: "2026-04-22T10:00:00.000Z",
				expires_at: "2026-05-22T10:00:00.000Z",
				id: "11111111-1111-4111-8111-111111111111",
				snapshot: {
					archetypeLabel: "Calm operator",
					backMetrics: [],
					headerLeftMetric: { label: "Sessions", value: "12" },
					headerRightMetric: { label: "Days", value: "6" },
					row: {
						activeDays: 6,
						cost: 0,
						displayName: "Ada",
						favoriteModel: "o3",
						hasActivity: true,
						imageUrl: null,
						inputTokens: 120,
						lastActiveDate: "2026-04-22",
						outputTokens: 240,
						role: "Builder",
						totalSessions: 12,
						totalTokens: 360,
					},
					shellClassName: "team-lineup-shell",
					statItems: [],
					theme: "light",
				},
			},
			isError: false,
			isPending: false,
		});
	});

	it("routes make yours into /wrapped with the share_id attribution", () => {
		render(<WrappedPublicPage publicId="share-123" />);

		expect(screen.getByText("Ada is a Calm operator")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Make yours" })).toHaveAttribute(
			"href",
			"/wrapped?share_id=share-123",
		);
	});

	it("keeps the same wrapped CTA when the public share is missing", () => {
		mockUseWrappedPublicPage.mockReturnValue({
			data: null,
			isError: true,
			isPending: false,
		});

		render(<WrappedPublicPage publicId="share-123" />);

		expect(
			screen.getByText("This card link expired or never existed."),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Make yours" })).toHaveAttribute(
			"href",
			"/wrapped?share_id=share-123",
		);
	});
});
