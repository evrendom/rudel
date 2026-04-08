import { describe, expect, test } from "bun:test";
import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import {
	buildDashboardDailyPatternFromRepositoryTrend,
	buildDashboardRepositoryDailyOverviewRows,
	buildDashboardRepositoryTabMetrics,
} from "./dashboard-repository-adapters";

describe("dashboard-repository-adapters", () => {
	test("aggregates repository trend into daily pattern points", () => {
		const rows: RepositoryDailyTrendData[] = [
			{
				date: "2026-04-01",
				repository: "alpha",
				sessions: 3,
				total_commits: 6,
			},
			{
				date: "2026-04-01",
				repository: "beta",
				sessions: 2,
				total_commits: 1,
			},
		];

		const dailyPattern = buildDashboardDailyPatternFromRepositoryTrend(
			"2026-04-01",
			"2026-04-02",
			rows,
		);

		expect(dailyPattern).toHaveLength(2);
		expect(dailyPattern[0]).toMatchObject({
			commitRate: 140,
			commits: 7,
			date: "2026-04-01",
			sessions: 5,
		});
		expect(dailyPattern[1]).toMatchObject({
			commitRate: null,
			commits: null,
			date: "2026-04-02",
			sessions: null,
		});
	});

	test("builds repository overview rows and headline metrics", () => {
		const rows: RepositoryDailyTrendData[] = [
			{
				date: "2026-04-01",
				repository: "alpha",
				sessions: 3,
				total_commits: 6,
			},
			{
				date: "2026-04-01",
				repository: "beta",
				sessions: 5,
				total_commits: 2,
			},
			{
				date: "2026-04-02",
				repository: "alpha",
				sessions: 1,
				total_commits: 1,
			},
		];

		const overviewRows = buildDashboardRepositoryDailyOverviewRows(
			"2026-04-01",
			"2026-04-02",
			rows,
		);
		const metrics = buildDashboardRepositoryTabMetrics([
			{
				activeDays: 2,
				commitRate: 175,
				commits: 7,
				id: "alpha",
				label: "alpha",
				sessions: 4,
			},
			{
				activeDays: 1,
				commitRate: 40,
				commits: 2,
				id: "beta",
				label: "beta",
				sessions: 5,
			},
		]);

		expect(overviewRows).toEqual([
			{
				activeRepositories: 2,
				date: "2026-04-01",
				leadRepositoryLabel: "beta",
				leadRepositorySessions: 5,
				leadRepositoryShare: 63,
				sessions: 8,
			},
			{
				activeRepositories: 1,
				date: "2026-04-02",
				leadRepositoryLabel: "alpha",
				leadRepositorySessions: 1,
				leadRepositoryShare: 100,
				sessions: 1,
			},
		]);
		expect(metrics).toEqual([
			{
				description: "Unique repositories active in the selected range.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "sessions",
				label: "Repos touched",
				valueLabel: "2",
			},
			{
				description: "Average session volume across active repositories.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "uncommitted",
				label: "Avg sessions / repo",
				valueLabel: "4.5",
			},
			{
				description: "Committed sessions divided by all repository sessions.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "commitRate",
				label: "Repo commit rate",
				valueLabel: "100%",
			},
		]);
	});
});
