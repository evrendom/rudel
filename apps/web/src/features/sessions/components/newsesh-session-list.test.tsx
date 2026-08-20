import type { SessionAnalytics } from "@rudel/api-routes";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { NewseshSessionList } from "./newsesh-session-list";

vi.mock("@/app/hooks/useLoadMoreIntersectionObserver", () => ({
	useLoadMoreIntersectionObserver: () => vi.fn(),
}));

vi.mock("@/app/ui/avatar", () => ({
	Avatar: ({ children, ...props }: ComponentProps<"div">) => (
		<div {...props}>{children}</div>
	),
	AvatarFallback: ({ children, ...props }: ComponentProps<"span">) => (
		<span {...props}>{children}</span>
	),
	AvatarImage: (props: ComponentProps<"img">) => <img alt="" {...props} />,
}));

vi.mock("@/features/dashboard/components/DashboardDateControls", () => ({
	DashboardDateControls: () => <button type="button">Date range</button>,
}));

vi.mock("@/features/shell/newsesh-list-header-portal", () => ({
	useNewseshListHeaderPortal: () =>
		document.getElementById("newsesh-test-header"),
}));

vi.mock("@/features/workspace/hooks/useUserMap", () => ({
	useUserMap: () => ({
		avatarMap: { "user-1": "/avatar.webp" },
		userMap: { "user-1": "Evren" },
	}),
}));

const baseSession: SessionAnalytics = {
	avg_period_sec: 45,
	duration_min: 12,
	error_count: 0,
	has_commit: true,
	input_tokens: 1_000,
	model_used: "gpt-5.6-sol",
	member_apologies: 0,
	member_positive: 0,
	member_swears: 0,
	model_apologies: 0,
	model_positive: 0,
	model_swears: 0,
	output_tokens: 100,
	project_path: "/Users/evren/rudel",
	repository: "rudel-v2",
	session_date: "2026-08-19T10:00:00.000Z",
	session_id: "session-0",
	skills: [],
	slash_commands: [],
	subagent_count: 0,
	subagent_types: [],
	success_score: 80,
	total_tokens: 1_100,
	used_plan_mode: false,
	user_id: "user-1",
	worktree: null,
};

function buildSessions(count: number) {
	return Array.from(
		{ length: count },
		(_, index): SessionAnalytics => ({
			...baseSession,
			input_tokens: index + 1_000,
			session_date: new Date(Date.UTC(2026, 7, 19, 10, 0, index)).toISOString(),
			session_id: `session-${index}`,
			total_tokens: index + 1_100,
		}),
	);
}

describe("NewseshSessionList sorting", () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="newsesh-test-header"></div>';
	});

	it("bounds the rendered rows and resets only the list when sorting", async () => {
		const user = userEvent.setup();
		const scrollContainerRef = { current: null as HTMLDivElement | null };

		render(
			<MemoryRouter>
				<NewseshSessionList
					activeSessionId="session-500"
					canOpenSession={() => true}
					getSessionHref={(session) => `/newsesh/${session.session_id}`}
					isError={false}
					isPending={false}
					onSessionClick={vi.fn()}
					scrollContainerRef={scrollContainerRef}
					sessions={buildSessions(1_000)}
				/>
			</MemoryRouter>,
		);

		const sessionsList = screen.getByRole("list", { name: "Recent sessions" });
		expect(within(sessionsList).getAllByRole("listitem")).toHaveLength(50);
		expect(sessionsList.querySelector("img")).toHaveAttribute(
			"loading",
			"lazy",
		);
		expect(scrollContainerRef.current).not.toBeNull();
		assert(scrollContainerRef.current);
		fireEvent.scroll(scrollContainerRef.current, {
			target: { scrollTop: 400 },
		});

		await user.click(screen.getByRole("button", { name: "Display options" }));
		await user.click(screen.getByRole("button", { name: "Cost" }));

		expect(scrollContainerRef.current.scrollTop).toBe(0);
		expect(
			screen.queryByRole("heading", { name: "Sort sessions" }),
		).not.toBeInTheDocument();
		expect(within(sessionsList).getAllByRole("listitem")).toHaveLength(50);
	});

	it("renders persisted list-row counts without requesting language signals", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const scrollContainerRef = { current: null as HTMLDivElement | null };

		render(
			<MemoryRouter>
				<NewseshSessionList
					activeSessionId={null}
					canOpenSession={() => true}
					getSessionHref={(session) => `/newsesh/${session.session_id}`}
					isError={false}
					isPending={false}
					onSessionClick={vi.fn()}
					scrollContainerRef={scrollContainerRef}
					sessions={[
						{
							...baseSession,
							member_swears: 2,
							model_apologies: 1,
						},
					]}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("you swore +1")).toBeInTheDocument();
		expect(screen.getByText("model apologized")).toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
