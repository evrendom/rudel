import type { HistoricalSkillDetail } from "@rudel/api-routes";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoricalSkillDetailContent } from "@/features/skills/components/HistoricalSkillDetailSheet";

const detail: HistoricalSkillDetail = {
	name: "testing-bun",
	sessionCount: 5,
	claudeSessionCount: 3,
	codexSessionCount: 2,
	sourceAgents: ["claude", "codex"],
	unavailableSessionCount: 1,
	versions: [
		{
			sourceAgent: "claude",
			contentSha256: "a".repeat(64),
			content: "# New version\n\n- Uses Bun\n",
			sessionCount: 3,
			firstUsedAt: "2026-02-01T00:00:00Z",
			lastUsedAt: "2026-03-01T00:00:00Z",
		},
		{
			sourceAgent: "codex",
			contentSha256: "b".repeat(64),
			content: "# Old version\n\nEarlier guidance.\n",
			sessionCount: 2,
			firstUsedAt: "2026-01-01T00:00:00Z",
			lastUsedAt: "2026-01-31T00:00:00Z",
		},
	],
};

describe("HistoricalSkillDetailContent", () => {
	it("renders Markdown and explains unavailable historical content", () => {
		render(
			<HistoricalSkillDetailContent
				detail={detail}
				isError={false}
				isPending={false}
				onRetry={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("heading", { name: "New version" }),
		).toBeInTheDocument();
		expect(screen.getByText("Uses Bun")).toBeInTheDocument();
		expect(
			screen.getByText(/couldn’t be recovered from 1 session/i),
		).toBeInTheDocument();
	});

	it("switches between distinct recovered versions", async () => {
		const user = userEvent.setup();

		render(
			<HistoricalSkillDetailContent
				detail={detail}
				isError={false}
				isPending={false}
				onRetry={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("combobox", { name: "Version" }));
		await user.click(
			screen.getByText(/Version 1 · Codex · Used in 2 sessions/i),
		);

		expect(
			screen.getByRole("heading", { name: "Old version" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "New version" }),
		).not.toBeInTheDocument();
	});

	it("renders loading, error, and fully unavailable states", async () => {
		const onRetry = vi.fn();
		const { rerender } = render(
			<HistoricalSkillDetailContent
				detail={undefined}
				isError={false}
				isPending
				onRetry={onRetry}
			/>,
		);

		expect(screen.getByText("Loading skill details")).toBeInTheDocument();

		rerender(
			<HistoricalSkillDetailContent
				detail={undefined}
				isError
				isPending={false}
				onRetry={onRetry}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(onRetry).toHaveBeenCalledTimes(1);

		rerender(
			<HistoricalSkillDetailContent
				detail={{
					name: "testing-bun",
					sessionCount: 2,
					claudeSessionCount: 0,
					codexSessionCount: 2,
					sourceAgents: ["codex"],
					unavailableSessionCount: 2,
					versions: [],
				}}
				isError={false}
				isPending={false}
				onRetry={onRetry}
			/>,
		);
		expect(
			screen.getByText("No complete content was recovered"),
		).toBeInTheDocument();
	});
});
