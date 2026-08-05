import { useMemo } from "react";
import {
	announceFrontendFixturesEnabled,
	buildDashboardFixtureData,
	type FrontendFixtureMember,
	isFrontendFixturesEnabled,
} from "@/dev/frontend-fixtures";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { buildDashboardPerformanceUsers } from "@/features/dashboard/data/dashboard-performance-adapter";
import { useFullOrganization } from "@/features/workspace/hooks/useFullOrganization";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { orpc } from "@/lib/orpc";

export function useDashboardPageData() {
	const { meta, state } = useDateRange();
	const { state: workspaceState } = useOrganization();
	const useFixtures = isFrontendFixturesEnabled();
	announceFrontendFixturesEnabled("dashboard");

	const { data: fullOrganization } = useFullOrganization(
		workspaceState.activeOrg?.id,
	);
	const fixtureMembers = useMemo<FrontendFixtureMember[]>(
		() =>
			(fullOrganization?.members ?? []).map((member) => ({
				displayName:
					member.user.name?.trim() ||
					member.user.email?.trim() ||
					member.userId,
				email: member.user.email,
				imageUrl: member.user.image,
				userId: member.userId,
			})),
		[fullOrganization?.members],
	);
	const fixtureData = useMemo(
		() =>
			useFixtures
				? buildDashboardFixtureData({
						endDate: state.endDate,
						members: fixtureMembers,
						startDate: state.startDate,
					})
				: null,
		[fixtureMembers, state.endDate, state.startDate, useFixtures],
	);

	const overviewKpisQuery = useAnalyticsQuery({
		...orpc.analytics.overview.kpis.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const usersTokenUsageQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersTokenUsage.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const modelTokensTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.modelTokensTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const usersDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.usersDailyTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const repositoriesDailyTrendQuery = useAnalyticsQuery({
		...orpc.analytics.overview.repositoriesDailyTrend.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
			},
		}),
		enabled: !useFixtures,
	});
	const projectInvestmentQuery = useAnalyticsQuery({
		...orpc.analytics.projects.investment.queryOptions({
			input: {
				days: meta.dayCount,
			},
		}),
		enabled: !useFixtures,
	});
	const errorProjectTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
				splitBy: "project_path",
			},
		}),
		enabled: !useFixtures,
	});
	const errorDeveloperTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
				splitBy: "user_id",
			},
		}),
		enabled: !useFixtures,
	});
	const errorModelTrendQuery = useAnalyticsQuery({
		...orpc.analytics.errors.trends.queryOptions({
			input: {
				startDate: state.startDate,
				endDate: state.endDate,
				splitBy: "model",
			},
		}),
		enabled: !useFixtures,
	});

	const overviewKpis = fixtureData?.overviewKpis ?? overviewKpisQuery.data;
	const usersTokenUsage =
		fixtureData?.usersTokenUsage ?? usersTokenUsageQuery.data;
	const modelTokensTrend =
		fixtureData?.modelTokensTrend ?? modelTokensTrendQuery.data;
	const usersDailyTrend =
		fixtureData?.usersDailyTrend ?? usersDailyTrendQuery.data;
	const repositoriesDailyTrend =
		fixtureData?.repositoriesDailyTrend ?? repositoriesDailyTrendQuery.data;
	const projectInvestment =
		fixtureData?.projectInvestment ?? projectInvestmentQuery.data ?? [];
	const errorProjectTrend =
		fixtureData?.errorProjectTrend ?? errorProjectTrendQuery.data;
	const errorDeveloperTrend =
		fixtureData?.errorDeveloperTrend ?? errorDeveloperTrendQuery.data;
	const errorModelTrend =
		fixtureData?.errorModelTrend ?? errorModelTrendQuery.data;

	const userImageById = useMemo(
		() =>
			new Map(
				(fullOrganization?.members ?? []).map((member) => [
					member.userId,
					member.user.image,
				]),
			),
		[fullOrganization?.members],
	);
	const performanceUsers = useMemo(
		() =>
			buildDashboardPerformanceUsers(
				usersTokenUsage,
				usersDailyTrend,
				userImageById,
				fullOrganization?.members ?? [],
			),
		[
			fullOrganization?.members,
			userImageById,
			usersDailyTrend,
			usersTokenUsage,
		],
	);

	return {
		endDate: state.endDate,
		errorDeveloperTrend,
		errorModelTrend,
		errorProjectTrend,
		isCostControlPending: {
			base: {
				members:
					!useFixtures &&
					(usersTokenUsageQuery.isPending || usersDailyTrendQuery.isPending),
				models: !useFixtures && modelTokensTrendQuery.isPending,
				repositories: !useFixtures && repositoriesDailyTrendQuery.isPending,
			},
			errors: {
				members: !useFixtures && errorDeveloperTrendQuery.isPending,
				models: !useFixtures && errorModelTrendQuery.isPending,
				repositories: !useFixtures && errorProjectTrendQuery.isPending,
			},
		},
		isOverviewKpisPending: !useFixtures && overviewKpisQuery.isPending,
		isRepositoryUploadStatusPending:
			!useFixtures && projectInvestmentQuery.isPending,
		modelTokensTrend,
		performanceUsers,
		projectInvestment,
		repositoriesDailyTrend,
		startDate: state.startDate,
		totalSessionCount: overviewKpis?.total_sessions,
		userDailyTrend: usersDailyTrend,
	};
}
