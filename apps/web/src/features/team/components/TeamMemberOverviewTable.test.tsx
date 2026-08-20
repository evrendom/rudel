import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { TeamPageMemberOverviewRow } from "@/features/team/use-team-page-data";
import { TeamMemberOverviewTable } from "./TeamMemberOverviewTable";

function buildTeamMemberRow(
	overrides: Partial<TeamPageMemberOverviewRow> = {},
): TeamPageMemberOverviewRow {
	return {
		activeDays: 14,
		activityTrend: [1, 3, 2, 5],
		archetype: { key: "obsessed", name: "Obsessed" },
		cost: 42,
		displayName: "Ada Lovelace",
		email: "ada@example.com",
		favoriteModel: "claude-sonnet-4-5",
		hasActivity: true,
		imageUrl: null,
		inputTokens: 120_000,
		lastActiveDate: "2026-04-22",
		modelUsage: [
			{ model: "claude-sonnet-4-5", usageCount: 12 },
			{ model: "gpt-5.1-codex", usageCount: 4 },
		],
		outputTokens: 60_000,
		role: "Member",
		totalSessions: 120,
		totalTokens: 180_000,
		userId: "user-1",
		...overrides,
	};
}

describe("TeamMemberOverviewTable", () => {
	it("renders the requested teammate metrics in a semantic table", () => {
		render(
			<TeamMemberOverviewTable
				canInviteTeamMembers={false}
				organizationId="org-1"
				rows={[buildTeamMemberRow()]}
			/>,
		);

		expect(
			screen.getByRole("columnheader", { name: "Teammate" }),
		).toBeVisible();
		expect(
			screen.getByRole("columnheader", { name: "Model composition" }),
		).toBeVisible();
		expect(
			screen.getByRole("columnheader", { name: "Activity" }),
		).toBeVisible();
		expect(
			screen.getByRole("columnheader", { name: "Sessions" }),
		).toBeVisible();
		expect(
			screen.getByRole("columnheader", { name: "Tokens used" }),
		).toBeVisible();
		expect(
			screen.getByRole("columnheader", { name: "API cost" }),
		).toBeVisible();
		expect(
			screen.getByRole("columnheader", { name: "Last active" }),
		).toBeVisible();
		expect(screen.getByText("Ada Lovelace")).toBeVisible();
		expect(screen.getByText("AL")).toBeVisible();
		expect(screen.getByTitle("Sonnet 4.5, GPT 5.1")).toBeVisible();
		expect(
			screen.getByRole("img", {
				name: "11 sessions across 4 activity periods",
			}),
		).toBeVisible();
		expect(screen.getByText("180K")).toBeVisible();
		expect(screen.getByText("120")).toBeVisible();
		expect(screen.getByText("$42")).toBeVisible();
		expect(screen.getByText("Apr 22, 2026")).toBeVisible();
	});

	it("keeps an invite placeholder as the first 64px body row", () => {
		render(
			<TeamMemberOverviewTable
				canInviteTeamMembers
				organizationId="org-1"
				rows={[buildTeamMemberRow()]}
			/>,
		);

		const tableRows = screen.getAllByRole("row");
		expect(tableRows).toHaveLength(3);
		expect(within(tableRows[1]).getByText("Add teammate")).toBeVisible();
		expect(
			within(tableRows[1]).getByRole("button", {
				name: "Create invite link",
			}),
		).toBeVisible();
		expect(within(tableRows[2]).getByText("Ada Lovelace")).toBeVisible();
		expect(tableRows[1]).toHaveClass("h-16");
		expect(tableRows[2]).toHaveClass("h-16");
	});

	it("keeps an exact 64px horizontal gutter around the table", () => {
		render(
			<TeamMemberOverviewTable
				canInviteTeamMembers={false}
				organizationId="org-1"
				rows={[buildTeamMemberRow()]}
			/>,
		);

		expect(screen.getByRole("table").parentElement).toHaveClass("px-16");
	});

	it("shows the top three models and collapses the remainder into a count", () => {
		render(
			<TeamMemberOverviewTable
				canInviteTeamMembers={false}
				organizationId="org-1"
				rows={[
					buildTeamMemberRow({
						modelUsage: [
							{ model: "fable-2", usageCount: 1 },
							{ model: "gpt-5.1-codex", usageCount: 4 },
							{ model: "claude-haiku-3-5", usageCount: 2 },
							{ model: "claude-sonnet-4-5", usageCount: 12 },
							{ model: "claude-opus-4-1", usageCount: 8 },
						],
					}),
				]}
			/>,
		);

		expect(screen.getByText("Sonnet 4.5")).toBeVisible();
		expect(screen.getByText("GPT 5.1")).toBeVisible();
		expect(screen.getByText("Opus 4.1")).toBeVisible();
		expect(screen.queryByText("Haiku 3.5")).not.toBeInTheDocument();
		expect(screen.queryByText("Fable 2")).not.toBeInTheDocument();
		expect(screen.getByText("+2")).toBeVisible();
		const modelBadges = screen
			.getByTitle("Sonnet 4.5, Opus 4.1, GPT 5.1, Haiku 3.5, Fable 2")
			.querySelectorAll(":scope > span");
		expect(modelBadges[0]).toHaveTextContent("Sonnet 4.5");
		expect(modelBadges[1]).toHaveTextContent("Opus 4.1");
		expect(modelBadges[2]).toHaveTextContent("GPT 5.1");
	});

	it("sorts teammate rows by each quantitative column", async () => {
		const user = userEvent.setup();
		render(
			<TeamMemberOverviewTable
				canInviteTeamMembers
				organizationId="org-1"
				rows={[
					buildTeamMemberRow({
						activityTrend: [3, 8],
						cost: 42,
						totalTokens: 180_000,
					}),
					buildTeamMemberRow({
						activityTrend: [10, 10],
						cost: 90,
						displayName: "Grace Hopper",
						totalSessions: 200,
						totalTokens: 90_000,
						userId: "user-2",
					}),
				]}
			/>,
		);

		const getFirstTeammateRow = () => screen.getAllByRole("row")[2];

		await user.click(
			screen.getByRole("button", { name: "Sort by Activity, descending" }),
		);
		expect(
			within(getFirstTeammateRow()).getByText("Grace Hopper"),
		).toBeVisible();

		await user.click(
			screen.getByRole("button", { name: "Sort by Sessions, descending" }),
		);
		expect(
			within(getFirstTeammateRow()).getByText("Grace Hopper"),
		).toBeVisible();

		await user.click(
			screen.getByRole("button", { name: "Sort by Tokens used, descending" }),
		);
		expect(
			within(getFirstTeammateRow()).getByText("Ada Lovelace"),
		).toBeVisible();

		await user.click(
			screen.getByRole("button", { name: "Sort by API cost, descending" }),
		);
		expect(
			within(getFirstTeammateRow()).getByText("Grace Hopper"),
		).toBeVisible();

		await user.click(
			screen.getByRole("button", { name: "Sort by API cost, ascending" }),
		);
		expect(
			within(getFirstTeammateRow()).getByText("Ada Lovelace"),
		).toBeVisible();
	});
});
