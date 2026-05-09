import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { TeamMembersCardGrid } from "./TeamMembersCardGrid";

function buildTeamMemberRow(
	overrides: Partial<TeamPageMemberRow> = {},
): TeamPageMemberRow {
	return {
		activeDays: 14,
		archetype: { key: "obsessed", name: "Obsessed" },
		cost: 42,
		displayName: "Ada Lovelace",
		email: "ada@example.com",
		favoriteModel: "claude-sonnet-4-5",
		hasActivity: true,
		imageUrl: null,
		inputTokens: 120_000,
		lastActiveDate: "2026-04-22",
		outputTokens: 60_000,
		role: "Member",
		totalSessions: 120,
		totalTokens: 180_000,
		userId: "user-1",
		...overrides,
	};
}

describe("TeamMembersCardGrid", () => {
	it("shows real archetypes and applies the matching card theme", () => {
		render(
			<TeamMembersCardGrid
				canInviteTeamMembers={false}
				currentUserId={null}
				isInviteLinkPending={false}
				rows={[buildTeamMemberRow()]}
				teamInviteLink={null}
			/>,
		);

		expect(screen.queryByText("To be revealed")).not.toBeInTheDocument();
		expect(screen.getByTitle("Obsessed")).toBeInTheDocument();

		const archetypeBadge = screen.getByTitle("Obsessed");
		const card = archetypeBadge.closest("article");
		expect(card).not.toBeNull();
		expect(card?.getAttribute("class")).toContain("#191919");
		expect(card?.getAttribute("class")).toContain("text-[#f5f1ec]");
	});

	it("uses the current product label for known classifier keys", () => {
		render(
			<TeamMembersCardGrid
				canInviteTeamMembers={false}
				currentUserId={null}
				isInviteLinkPending={false}
				rows={[
					buildTeamMemberRow({
						archetype: {
							key: "smooth_operator",
							name: "Smooth Operator",
						},
						userId: "user-2",
					}),
				]}
				teamInviteLink={null}
			/>,
		);

		expect(screen.getByTitle("Smooth Operator")).toBeInTheDocument();
		expect(screen.queryByText("To be revealed")).not.toBeInTheDocument();
	});

	it("wraps the current user's card with a hover-revealed secondary sharing page link", () => {
		render(
			<MemoryRouter>
				<TeamMembersCardGrid
					canInviteTeamMembers={false}
					currentUserId="user-1"
					isInviteLinkPending={false}
					rows={[buildTeamMemberRow()]}
					teamInviteLink={null}
				/>
			</MemoryRouter>,
		);

		const shareLink = screen.getByRole("link", {
			name: "View sharing page",
		});
		expect(shareLink).toHaveAttribute(
			"href",
			"/wrapped?flow=story&step=card&stage=share",
		);
		expect(shareLink).toHaveAttribute("target", "_blank");
		expect(shareLink).toHaveAttribute("rel", "noreferrer");
		const shareLinkClassName = shareLink.getAttribute("class");
		expect(shareLinkClassName).toContain("bg-secondary");
		expect(shareLinkClassName).toContain("opacity-0");
		expect(shareLinkClassName).toContain("absolute");
		expect(shareLinkClassName).toContain("bottom-2");
		expect(shareLinkClassName).toContain("rounded-[10px]");
		expect(shareLinkClassName).toContain(
			"group-hover/team-share-card:opacity-100",
		);
		expect(shareLinkClassName).not.toContain(
			"group-focus-within/team-share-card:opacity-100",
		);
		const cardShell = shareLink.parentElement;
		expect(cardShell?.getAttribute("class")).toContain("h-[358px] w-[233px]");
		expect(cardShell?.getAttribute("class")).toContain("group/team-share-card");
	});
});
