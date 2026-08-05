import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillsPageView } from "@/features/skills/components/SkillsPageView";

const skills = [
	{ name: "testing-bun", sessionCount: 12 },
	{ name: "Design", sessionCount: 3 },
	{
		name: "a-very-long-skill-name-that-needs-to-wrap-without-breaking-the-row-layout",
		sessionCount: 1,
	},
] as const;

describe("SkillsPageView", () => {
	it("renders exact names, usage counts, and opens a selected skill", async () => {
		const user = userEvent.setup();
		const onSelectSkill = vi.fn();

		render(
			<SkillsPageView
				skills={skills}
				isError={false}
				isPending={false}
				onRetry={vi.fn()}
				onSelectSkill={onSelectSkill}
			/>,
		);

		expect(screen.getByText("testing-bun")).toBeInTheDocument();
		expect(screen.getByText("Used in 12 sessions")).toBeInTheDocument();
		expect(
			screen.getByText(
				"a-very-long-skill-name-that-needs-to-wrap-without-breaking-the-row-layout",
			),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /testing-bun/i }));
		expect(onSelectSkill).toHaveBeenCalledWith("testing-bun");
	});

	it("filters names without changing their original case", async () => {
		const user = userEvent.setup();

		render(
			<SkillsPageView
				skills={skills}
				isError={false}
				isPending={false}
				onRetry={vi.fn()}
				onSelectSkill={vi.fn()}
			/>,
		);

		await user.type(
			screen.getByRole("searchbox", { name: "Search skills" }),
			"DES",
		);

		expect(screen.getByText("Design")).toBeInTheDocument();
		expect(screen.queryByText("testing-bun")).not.toBeInTheDocument();
	});

	it("supports filtered-empty and clear-search states", async () => {
		const user = userEvent.setup();

		render(
			<SkillsPageView
				skills={skills}
				isError={false}
				isPending={false}
				onRetry={vi.fn()}
				onSelectSkill={vi.fn()}
			/>,
		);

		const search = screen.getByRole("searchbox", { name: "Search skills" });
		await user.type(search, "not-present");
		expect(screen.getByText("No matching skills")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Clear search" }));
		expect(search).toHaveValue("");
		expect(screen.getByText("testing-bun")).toBeInTheDocument();
	});

	it("renders loading, API-error, and no-skills states", async () => {
		const onRetry = vi.fn();
		const { rerender } = render(
			<SkillsPageView
				skills={undefined}
				isError={false}
				isPending
				onRetry={onRetry}
				onSelectSkill={vi.fn()}
			/>,
		);

		expect(screen.getByText("Loading skills")).toBeInTheDocument();

		rerender(
			<SkillsPageView
				skills={undefined}
				isError
				isPending={false}
				onRetry={onRetry}
				onSelectSkill={vi.fn()}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(onRetry).toHaveBeenCalledTimes(1);

		rerender(
			<SkillsPageView
				skills={[]}
				isError={false}
				isPending={false}
				onRetry={onRetry}
				onSelectSkill={vi.fn()}
			/>,
		);
		expect(screen.getByText("No Codex skills yet")).toBeInTheDocument();
	});
});
