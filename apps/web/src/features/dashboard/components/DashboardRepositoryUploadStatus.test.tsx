import type { ProjectInvestment } from "@rudel/api-routes";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardRepositoryUploadStatus } from "@/features/dashboard/components/DashboardRepositoryUploadStatus";

function createProject(
	overrides: Partial<ProjectInvestment> = {},
): ProjectInvestment {
	return {
		automated_sessions: 0,
		cost: 1,
		last_session_at: "2026-08-10T10:00:00.000Z",
		manual_sessions: 1,
		project_path: "/Users/evren/conductor/workspaces/rudel-v2/podgorica",
		repository: null,
		sessions: 1,
		success_rate: 1,
		success_rate_trend: 0,
		total_duration_min: 10,
		total_tokens: 1_000,
		unclassified_sessions: 0,
		unique_users: 1,
		...overrides,
	};
}

describe("DashboardRepositoryUploadStatus", () => {
	it("groups Conductor worktrees into one repository without showing their cities", () => {
		render(
			<DashboardRepositoryUploadStatus
				isPending={false}
				projects={[
					createProject({
						automated_sessions: 2,
						manual_sessions: 0,
						sessions: 2,
					}),
					createProject({
						last_session_at: "2026-08-10T11:00:00.000Z",
						manual_sessions: 3,
						project_path: "/Users/evren/conductor/workspaces/rudel-v2/lansing",
						sessions: 3,
					}),
				]}
			/>,
		);

		const repositoryList = screen.getByRole("list");
		expect(within(repositoryList).getAllByRole("listitem")).toHaveLength(1);
		expect(within(repositoryList).getByText("rudel-v2")).toBeVisible();
		expect(within(repositoryList).getByText("5 sessions")).toBeInTheDocument();
		expect(
			within(repositoryList).queryByText(/podgorica/),
		).not.toBeInTheDocument();
		expect(
			within(repositoryList).queryByText(/lansing/),
		).not.toBeInTheDocument();
	});
});
