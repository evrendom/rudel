import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WrappedSetupCompletePage } from "@/features/wrapped/WrappedSetupCompletePage";

const { mockUseAnalyticsQuery } = vi.hoisted(() => ({
	mockUseAnalyticsQuery: vi.fn(),
}));

vi.mock("@/features/analytics/queries/useAnalyticsQuery", () => ({
	useAnalyticsQuery: mockUseAnalyticsQuery,
}));

Object.defineProperty(window, "scrollTo", {
	writable: true,
	value: vi.fn(),
});

describe("WrappedSetupCompletePage", () => {
	beforeEach(() => {
		mockUseAnalyticsQuery.mockReset();
		vi.mocked(window.scrollTo).mockReset();
	});

	it("renders the uploaded repos list and continues to the story", async () => {
		const user = userEvent.setup();
		const onContinue = vi.fn();

		mockUseAnalyticsQuery.mockReturnValue({
			data: [
				{
					first_session: "2026-04-22T10:00:00Z",
					git_remote: "github.com/acme/geneva.git",
					last_session: "2026-04-22T10:00:00Z",
					package_name: "",
					project_path: "/Users/ada/geneva",
					sessions: 8,
					total_duration_min: 90,
					total_tokens: 1200,
				},
				{
					first_session: "2026-04-22T10:00:00Z",
					git_remote: "",
					last_session: "2026-04-22T10:00:00Z",
					package_name: "@acme/design-system",
					project_path: "/Users/ada/design-system",
					sessions: 3,
					total_duration_min: 45,
					total_tokens: 900,
				},
			],
			isLoading: false,
		});

		render(
			<MemoryRouter>
				<WrappedSetupCompletePage
					onContinue={onContinue}
					totalSessionCount={11}
					userId="user-1"
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("heading", { name: "Sessions landed" }),
		).toBeInTheDocument();
		expect(screen.getByText("11 sessions across 2 repos")).toBeInTheDocument();
		expect(screen.getByText("geneva")).toBeInTheDocument();
		expect(screen.getByText("@acme/design-system")).toBeInTheDocument();
		expect(screen.getByText("8 sessions")).toBeInTheDocument();
		expect(screen.getByText("3 sessions")).toBeInTheDocument();
		expect(screen.queryByText("rudel enable")).toBeNull();
		expect(screen.queryByText("rudel upload")).toBeNull();

		await user.click(screen.getByRole("button", { name: "Upload more" }));

		expect(
			screen.getByText(
				"Auto upload + upload historical sessions in a given repo",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Manually select sessions in a given repo with no auto upload in the future",
			),
		).toBeInTheDocument();
		expect(
			await screen.findByText(hasExactTextContent("rudel enable"), {
				selector: "code",
			}),
		).toBeInTheDocument();
		expect(
			await screen.findByText(hasExactTextContent("rudel upload"), {
				selector: "code",
			}),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "See your story" }));

		expect(onContinue).toHaveBeenCalledTimes(1);
	});

	it("renders debug override repos without relying on analytics data", async () => {
		const user = userEvent.setup();
		const onContinue = vi.fn();

		mockUseAnalyticsQuery.mockReturnValue({
			data: undefined,
			isLoading: false,
		});

		render(
			<MemoryRouter>
				<WrappedSetupCompletePage
					onContinue={onContinue}
					reposOverride={[
						{
							name: "geneva",
							projectPath: "/Users/ada/geneva",
							sessions: 1,
						},
						{
							name: "@acme/design-system",
							projectPath: "/Users/ada/design-system",
							sessions: 1,
						},
						{
							name: "rudel-cli",
							projectPath: "/Users/ada/rudel-cli",
							sessions: 1,
						},
						{
							name: "agentation",
							projectPath: "/Users/ada/agentation",
							sessions: 1,
						},
						{
							name: "analytics-pipeline",
							projectPath: "/Users/ada/analytics-pipeline",
							sessions: 1,
						},
						{
							name: "docs-site",
							projectPath: "/Users/ada/docs-site",
							sessions: 1,
						},
						{
							name: "infra",
							projectPath: "/Users/ada/infra",
							sessions: 1,
						},
						{
							name: "mobile-app",
							projectPath: "/Users/ada/mobile-app",
							sessions: 1,
						},
						{
							name: "playground",
							projectPath: "/Users/ada/playground",
							sessions: 1,
						},
						{
							name: "web-sdk",
							projectPath: "/Users/ada/web-sdk",
							sessions: 1,
						},
					]}
					totalSessionCount={10}
					userId="wrapped-dev-preview"
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("10 sessions across 10 repos")).toBeInTheDocument();
		expect(screen.getByText("geneva")).toBeInTheDocument();
		expect(screen.getByText("@acme/design-system")).toBeInTheDocument();
		expect(screen.getByText("rudel-cli")).toBeInTheDocument();
		expect(screen.getByText("web-sdk")).toBeInTheDocument();
		expect(screen.getAllByText("1 session")).toHaveLength(10);

		await user.click(screen.getByRole("button", { name: "See your story" }));

		expect(onContinue).toHaveBeenCalledTimes(1);
	});
});

function hasExactTextContent(expectedText: string) {
	return (_content: string, element: Element | null) =>
		element?.textContent === expectedText;
}
