import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { type ReactNode, useEffect, useState } from "react";
import {
	MemoryRouter,
	Routes,
	Route,
	useNavigate,
	useLocation,
	useSearchParams,
} from "react-router-dom";
import { DateRangeProvider, useDateRange } from "../contexts/DateRangeContext";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

function TestConsumer({
	onRender,
}: {
	onRender?: (data: {
		startDate: string;
		endDate: string;
		location: string;
		search: string;
	}) => void;
}) {
	const { startDate, endDate, setStartDate, setEndDate } = useDateRange();
	const location = useLocation();

	useEffect(() => {
		onRender?.({
			startDate,
			endDate,
			location: location.pathname,
			search: location.search,
		});
	}, [startDate, endDate, location.pathname, location.search, onRender]);

	return (
		<div>
			<span data-testid="start-date">{startDate}</span>
			<span data-testid="end-date">{endDate}</span>
			<span data-testid="location">{location.pathname}</span>
			<span data-testid="search">{location.search}</span>
			<button
				data-testid="change-dates"
				onClick={() => {
					setStartDate("2026-01-01");
					setEndDate("2026-01-31");
				}}
			>
				Change Dates
			</button>
		</div>
	);
}

function NavigationTestApp({
	onRender,
}: {
	onRender?: (data: {
		startDate: string;
		endDate: string;
		location: string;
		search: string;
	}) => void;
}) {
	const navigate = useNavigate();

	return (
		<Routes>
			<Route
				path="/projects"
				element={
					<DateRangeProvider>
						<div>
							<TestConsumer onRender={onRender} />
							<button
								data-testid="go-to-detail"
								onClick={() => navigate("/projects/my-project")}
							>
								Go to Detail
							</button>
						</div>
					</DateRangeProvider>
				}
			/>
			<Route
				path="/projects/:projectPath"
				element={
					<DateRangeProvider>
						<div>
							<TestConsumer onRender={onRender} />
							<button data-testid="go-back" onClick={() => navigate(-1)}>
								Go Back
							</button>
						</div>
					</DateRangeProvider>
				}
			/>
		</Routes>
	);
}

describe("DateRangeContext", () => {
	test("initializes with URL params when present", async () => {
		render(
			<MemoryRouter
				initialEntries={["/projects?from=2026-02-01&to=2026-02-28"]}
			>
				<Routes>
					<Route
						path="/projects"
						element={
							<DateRangeProvider>
								<TestConsumer />
							</DateRangeProvider>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("start-date").textContent).toBe("2026-02-01");
			expect(screen.getByTestId("end-date").textContent).toBe("2026-02-28");
		});
	});

	test("falls back to localStorage when no URL params", async () => {
		localStorage.setItem(
			"dateRange",
			JSON.stringify({ start: "2026-03-01", end: "2026-03-15" }),
		);

		render(
			<MemoryRouter initialEntries={["/projects"]}>
				<Routes>
					<Route
						path="/projects"
						element={
							<DateRangeProvider>
								<TestConsumer />
							</DateRangeProvider>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("start-date").textContent).toBe("2026-03-01");
			expect(screen.getByTestId("end-date").textContent).toBe("2026-03-15");
		});
	});

	test("updates URL params when dates change", async () => {
		render(
			<MemoryRouter initialEntries={["/projects"]}>
				<Routes>
					<Route
						path="/projects"
						element={
							<DateRangeProvider>
								<TestConsumer />
							</DateRangeProvider>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		await act(async () => {
			screen.getByTestId("change-dates").click();
		});

		await waitFor(() => {
			expect(screen.getByTestId("start-date").textContent).toBe("2026-01-01");
			expect(screen.getByTestId("end-date").textContent).toBe("2026-01-31");
			expect(screen.getByTestId("search").textContent).toContain(
				"from=2026-01-01",
			);
			expect(screen.getByTestId("search").textContent).toContain(
				"to=2026-01-31",
			);
		});
	});
});

describe("DateRangeContext - Browser Back Navigation Bug", () => {
	/**
	 * BUG: When user picks a different date on a project page and then navigates
	 * back via browser, the page becomes blank.
	 *
	 * Root cause hypothesis: The DateRangeContext has two useEffect hooks:
	 * 1. First effect: Reads URL params and updates state
	 * 2. Second effect: Updates URL params when state changes (using { replace: true })
	 *
	 * When browser back is pressed:
	 * 1. URL changes back to previous state
	 * 2. First useEffect runs and updates dates from new (old) URL params
	 * 3. Second useEffect runs and calls setSearchParams with { replace: true }
	 * 4. This REPLACES the current history entry, corrupting the history stack
	 *
	 * The { replace: true } is problematic because it modifies history during
	 * back navigation, which can cause:
	 * - Infinite loops
	 * - History stack corruption
	 * - Loss of navigation state
	 * - Blank page when React can't reconcile the state
	 */

	test("BUG REPRO: back navigation after date change should restore previous URL params", async () => {
		const renderHistory: Array<{
			startDate: string;
			endDate: string;
			location: string;
			search: string;
		}> = [];

		render(
			<MemoryRouter
				initialEntries={["/projects?from=2026-02-01&to=2026-02-28"]}
			>
				<NavigationTestApp onRender={(data) => renderHistory.push(data)} />
			</MemoryRouter>,
		);

		// Wait for initial render on projects list page
		await waitFor(() => {
			expect(screen.getByTestId("start-date").textContent).toBe("2026-02-01");
		});

		// Navigate to project detail page
		await act(async () => {
			screen.getByTestId("go-to-detail").click();
		});

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe(
				"/projects/my-project",
			);
		});

		// Change dates on detail page
		await act(async () => {
			screen.getByTestId("change-dates").click();
		});

		await waitFor(() => {
			expect(screen.getByTestId("start-date").textContent).toBe("2026-01-01");
			expect(screen.getByTestId("end-date").textContent).toBe("2026-01-31");
		});

		// Navigate back (simulating browser back button)
		await act(async () => {
			screen.getByTestId("go-back").click();
		});

		// BUG: After going back, the component should render and show the original dates
		// If the bug exists, this will timeout or show incorrect state
		await waitFor(
			() => {
				// Should be back on /projects with original dates
				expect(screen.getByTestId("location").textContent).toBe("/projects");
				// Original dates should be restored from URL
				expect(screen.getByTestId("start-date").textContent).toBe("2026-02-01");
				expect(screen.getByTestId("end-date").textContent).toBe("2026-02-28");
			},
			{ timeout: 2000 },
		);
	});

	test("BUG REPRO: setSearchParams with replace:true should not be called during back navigation", async () => {
		// Track all setSearchParams calls
		const searchParamsHistory: string[] = [];

		function TrackedDateRangeConsumer() {
			const { startDate, endDate, setStartDate, setEndDate } = useDateRange();
			const [searchParams] = useSearchParams();
			const location = useLocation();
			const navigate = useNavigate();

			useEffect(() => {
				// Record every time search params change
				searchParamsHistory.push(location.search);
			}, [location.search]);

			return (
				<div>
					<span data-testid="start-date">{startDate}</span>
					<span data-testid="end-date">{endDate}</span>
					<span data-testid="search">{location.search}</span>
					<button
						data-testid="change-dates"
						onClick={() => {
							setStartDate("2026-01-01");
							setEndDate("2026-01-31");
						}}
					>
						Change Dates
					</button>
					<button data-testid="go-back" onClick={() => navigate(-1)}>
						Go Back
					</button>
				</div>
			);
		}

		render(
			<MemoryRouter
				initialEntries={["/page1?from=2026-02-01&to=2026-02-28", "/page2"]}
			>
				<Routes>
					<Route
						path="/page1"
						element={
							<DateRangeProvider>
								<TrackedDateRangeConsumer />
							</DateRangeProvider>
						}
					/>
					<Route
						path="/page2"
						element={
							<DateRangeProvider>
								<TrackedDateRangeConsumer />
							</DateRangeProvider>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		// Wait for initial render on page2
		await waitFor(() => {
			expect(screen.getByTestId("start-date")).toBeDefined();
		});

		// Change dates on page2
		await act(async () => {
			screen.getByTestId("change-dates").click();
		});

		await waitFor(() => {
			expect(screen.getByTestId("start-date").textContent).toBe("2026-01-01");
		});

		const historyLengthBeforeBack = searchParamsHistory.length;

		// Navigate back
		await act(async () => {
			screen.getByTestId("go-back").click();
		});

		// Wait for navigation
		await waitFor(() => {
			expect(screen.getByTestId("search").textContent).toContain(
				"from=2026-02-01",
			);
		});

		// BUG: The second useEffect with { replace: true } will cause extra setSearchParams calls
		// During back navigation, we should only see the URL change once (from the navigation)
		// If there are multiple changes, it indicates the bug where setSearchParams is being
		// called unnecessarily during back navigation
		const changesAfterBack =
			searchParamsHistory.length - historyLengthBeforeBack;

		// Ideally, only 1 change should happen (the back navigation itself)
		// If changesAfterBack > 1, the bug is present
		expect(changesAfterBack).toBeLessThanOrEqual(1);
	});

	test("BUG REPRO: rapid date changes followed by back navigation should not cause infinite loops", async () => {
		let renderCount = 0;

		function CountingConsumer() {
			const { startDate, endDate, setStartDate, setEndDate } = useDateRange();
			const navigate = useNavigate();
			const location = useLocation();

			useEffect(() => {
				renderCount++;
			});

			return (
				<div>
					<span data-testid="start-date">{startDate}</span>
					<span data-testid="location">{location.pathname}</span>
					<button
						data-testid="change-dates-1"
						onClick={() => {
							setStartDate("2026-01-01");
							setEndDate("2026-01-31");
						}}
					>
						Change 1
					</button>
					<button
						data-testid="change-dates-2"
						onClick={() => {
							setStartDate("2026-03-01");
							setEndDate("2026-03-31");
						}}
					>
						Change 2
					</button>
					<button data-testid="go-back" onClick={() => navigate(-1)}>
						Go Back
					</button>
				</div>
			);
		}

		render(
			<MemoryRouter initialEntries={["/page1", "/page2"]}>
				<Routes>
					<Route
						path="/page1"
						element={
							<DateRangeProvider>
								<CountingConsumer />
							</DateRangeProvider>
						}
					/>
					<Route
						path="/page2"
						element={
							<DateRangeProvider>
								<CountingConsumer />
							</DateRangeProvider>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe("/page2");
		});

		// Rapid date changes
		await act(async () => {
			screen.getByTestId("change-dates-1").click();
		});
		await act(async () => {
			screen.getByTestId("change-dates-2").click();
		});

		renderCount = 0;

		// Navigate back
		await act(async () => {
			screen.getByTestId("go-back").click();
		});

		// Wait for navigation to complete
		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe("/page1");
		});

		// Allow any pending effects to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// BUG: If there's an infinite loop or excessive re-renders,
		// renderCount will be very high. A healthy navigation should
		// only cause a few renders (typically 2-4).
		expect(renderCount).toBeLessThan(10);
	});

	test("BUG REPRO: navigating back to page without date params should not cause blank page", async () => {
		render(
			<MemoryRouter
				initialEntries={["/page1", "/page2?from=2026-01-01&to=2026-01-31"]}
			>
				<Routes>
					<Route
						path="/page1"
						element={
							<DateRangeProvider>
								<TestConsumer />
							</DateRangeProvider>
						}
					/>
					<Route
						path="/page2"
						element={
							<DateRangeProvider>
								<div>
									<TestConsumer />
									<button
										data-testid="go-back"
										onClick={() => {
											// This simulates browser back button
											window.history.back();
										}}
									>
										Go Back
									</button>
								</div>
							</DateRangeProvider>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("start-date").textContent).toBe("2026-01-01");
		});

		// Navigate back to page without date params
		await act(async () => {
			screen.getByTestId("go-back").click();
		});

		// BUG: The page should render with default dates, not be blank
		// If the DateRangeProvider throws or causes an error, the page will be blank
		await waitFor(
			() => {
				// Component should still be mounted and showing dates
				const startDate = screen.getByTestId("start-date");
				expect(startDate).toBeDefined();
				expect(startDate.textContent).toBeTruthy();
			},
			{ timeout: 2000 },
		);
	});
});

describe("DateRangeContext - History Stack Integrity", () => {
	/**
	 * BUG: This test demonstrates that the history stack is being modified
	 * unexpectedly when dates change. Even though `replace: true` is used
	 * in setSearchParams, the history length increases from 2 to 4.
	 *
	 * This indicates that either:
	 * 1. The replace option is not working as expected
	 * 2. Multiple setSearchParams calls are being made
	 * 3. The useEffect dependencies are causing excessive re-runs
	 *
	 * This contributes to the blank page bug because when browser back
	 * is pressed, the history stack may be in an inconsistent state.
	 */
	test("BUG REPRO: changing dates should not corrupt history stack", async () => {
		let historyLength = 0;

		function HistoryTracker() {
			const { setStartDate, setEndDate } = useDateRange();
			const location = useLocation();

			useEffect(() => {
				// In a real browser, window.history.length would track this
				// In MemoryRouter, we track location changes
				historyLength++;
			}, [location.key]);

			return (
				<button
					data-testid="change-dates"
					onClick={() => {
						setStartDate("2026-05-01");
						setEndDate("2026-05-31");
					}}
				>
					Change
				</button>
			);
		}

		render(
			<MemoryRouter initialEntries={["/page?from=2026-01-01&to=2026-01-31"]}>
				<Routes>
					<Route
						path="/page"
						element={
							<DateRangeProvider>
								<HistoryTracker />
							</DateRangeProvider>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		const initialHistoryLength = historyLength;

		// Change dates
		await act(async () => {
			screen.getByTestId("change-dates").click();
		});

		// Wait for state to settle
		await new Promise((resolve) => setTimeout(resolve, 100));

		// BUG: With { replace: true }, history length should stay the same
		// (URL is replaced, not pushed). Currently this FAILS because the
		// history goes from 2 to 4, indicating history corruption.
		//
		// EXPECTED: historyLength === initialHistoryLength (e.g., 2 === 2)
		// ACTUAL: historyLength > initialHistoryLength (e.g., 4 > 2)
		//
		// This test documents the bug. When fixed, the history length
		// should remain constant when using { replace: true }.
		expect(historyLength).toBe(initialHistoryLength);
	});
});
