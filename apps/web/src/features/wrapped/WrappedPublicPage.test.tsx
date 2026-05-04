import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedPublicPage } from "@/features/wrapped/WrappedPublicPage";

const {
	mockTrackWrappedShareCtaClicked,
	mockTrackWrappedShareViewed,
	mockUseSession,
	mockUseWrappedPublicPage,
} = vi.hoisted(() => ({
	mockTrackWrappedShareCtaClicked: vi.fn(),
	mockTrackWrappedShareViewed: vi.fn(),
	mockUseSession: vi.fn(),
	mockUseWrappedPublicPage: vi.fn(),
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
		trackWrappedShareCtaClicked: mockTrackWrappedShareCtaClicked,
		trackWrappedShareViewed: mockTrackWrappedShareViewed,
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
		<a
			href={href}
			onClick={(event) => {
				event.preventDefault();
				onClick?.();
			}}
		>
			{children}
		</a>
	),
	WrappedPublicCardScreen: ({
		action,
		activeArchetype,
		edition,
		row,
	}: {
		action: ReactNode;
		activeArchetype: { displayLabel: string };
		edition?: string;
		row: { displayName: string; imageUrl: string | null };
	}) => (
		<div>
			<h1>{`${row.displayName} is a ${activeArchetype.displayLabel}`}</h1>
			{edition ? <div>Edition: {edition}</div> : null}
			{row.imageUrl ? <img alt={row.displayName} src={row.imageUrl} /> : null}
			{action}
		</div>
	),
}));

describe("WrappedPublicPage", () => {
	beforeEach(() => {
		mockTrackWrappedShareCtaClicked.mockReset();
		mockTrackWrappedShareViewed.mockReset();
		mockUseSession.mockReset();
		mockUseWrappedPublicPage.mockReset();

		mockUseSession.mockReturnValue({ data: null });
		mockUseWrappedPublicPage.mockReturnValue({
			data: {
				created_at: "2026-04-22T10:00:00.000Z",
				expires_at: "2026-05-22T10:00:00.000Z",
				id: "11111111-1111-4111-8111-111111111111",
				variant: "normal",
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

	it("tracks share exposure and routes make yours into /wrapped with attribution", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter initialEntries={["/wrapped/share-123"]}>
				<WrappedPublicPage publicId="share-123" />
			</MemoryRouter>,
		);

		expect(screen.getByText("Ada is a Calm operator")).toBeInTheDocument();
		const makeYoursLink = screen.getByRole("link", { name: "Make yours" });
		expect(makeYoursLink).toHaveAttribute(
			"href",
			"/wrapped?share_id=share-123",
		);
		await waitFor(() => {
			expect(mockTrackWrappedShareViewed).toHaveBeenCalledWith({
				activationState: "anonymous",
				entrySource: "public_share",
				isAuthenticatedViewer: false,
				isNewUser: undefined,
				shareId: "share-123",
				sourceComponent: "wrapped_public_page",
			});
		});

		await user.click(makeYoursLink);

		expect(mockTrackWrappedShareCtaClicked).toHaveBeenCalledWith({
			activationState: "guest_redirect",
			entrySource: "public_share",
			isNewUser: undefined,
			redirectTarget: "/wrapped?share_id=share-123",
			shareId: "share-123",
			sourceComponent: "wrapped_public_page",
		});
	});

	it("keeps HTTPS account avatars on the public card row", () => {
		mockUseWrappedPublicPage.mockReturnValue({
			data: {
				created_at: "2026-04-22T10:00:00.000Z",
				expires_at: "2026-05-22T10:00:00.000Z",
				id: "evren",
				variant: "normal",
				snapshot: {
					archetypeLabel: "Calm operator",
					backMetrics: [],
					headerLeftMetric: { label: "Sessions", value: "12" },
					headerRightMetric: { label: "Days", value: "6" },
					row: {
						activeDays: 6,
						cost: 0,
						displayName: "Evren",
						favoriteModel: "o3",
						hasActivity: true,
						imageUrl: "https://avatars.githubusercontent.com/u/1?v=4",
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

		render(
			<MemoryRouter initialEntries={["/wrapped/evren"]}>
				<WrappedPublicPage publicId="evren" />
			</MemoryRouter>,
		);

		expect(screen.getByRole("img", { name: "Evren" })).toHaveAttribute(
			"src",
			"https://avatars.githubusercontent.com/u/1?v=4",
		);
	});

	it("renders Decimal shares as an edition on the persisted archetype", () => {
		mockUseWrappedPublicPage.mockReturnValue({
			data: {
				created_at: "2026-04-22T10:00:00.000Z",
				expires_at: "2026-05-22T10:00:00.000Z",
				id: "ada-decimal",
				variant: "decimal",
				snapshot: {
					archetypeLabel: "Roadrunner",
					backMetrics: [],
					headerLeftMetric: { label: "Sessions", value: "12" },
					headerRightMetric: { label: "Archetype", value: "Roadrunner" },
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

		render(
			<MemoryRouter initialEntries={["/wrapped/ada-decimal"]}>
				<WrappedPublicPage publicId="ada-decimal" />
			</MemoryRouter>,
		);

		expect(screen.getByText("Ada is a Roadrunner")).toBeInTheDocument();
		expect(screen.getByText("Edition: decimal")).toBeInTheDocument();
	});

	it("keeps the same wrapped CTA when the public share is missing", () => {
		mockUseWrappedPublicPage.mockReturnValue({
			data: null,
			isError: true,
			isPending: false,
		});

		render(
			<MemoryRouter initialEntries={["/wrapped/share-123"]}>
				<WrappedPublicPage publicId="share-123" />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("This card link expired or never existed."),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Make yours" })).toHaveAttribute(
			"href",
			"/wrapped?share_id=share-123",
		);
		expect(mockTrackWrappedShareViewed).not.toHaveBeenCalled();
	});

	it("preserves launch attribution on the make yours redirect", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter
				initialEntries={[
					"/wrapped/share-123?utm_source=x&utm_medium=social&utm_campaign=launch&launch_channel=borrowed_loop",
				]}
			>
				<WrappedPublicPage publicId="share-123" />
			</MemoryRouter>,
		);

		const makeYoursLink = screen.getByRole("link", { name: "Make yours" });
		expect(makeYoursLink).toHaveAttribute(
			"href",
			"/wrapped?share_id=share-123&utm_source=x&utm_medium=social&utm_campaign=launch&launch_channel=borrowed_loop",
		);

		await user.click(makeYoursLink);

		expect(mockTrackWrappedShareCtaClicked).toHaveBeenCalledWith(
			expect.objectContaining({
				redirectTarget:
					"/wrapped?share_id=share-123&utm_source=x&utm_medium=social&utm_campaign=launch&launch_channel=borrowed_loop",
			}),
		);
	});
});
