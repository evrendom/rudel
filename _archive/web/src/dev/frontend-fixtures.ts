import {
	type DeveloperSummary,
	type DeveloperTeamCard,
	type ErrorsDashboard,
	type ErrorTrendDataPoint,
	ESTIMATED_PRICING_MODE,
	type ModelTokensTrendData,
	type OverviewKPIs,
	type RepositoryDailyTrendData,
	type ROIDashboard,
	type SessionAnalyticsSummaryComparison,
	type UserDailyTrendData,
	type UserTokenUsageData,
} from "@rudel/api-routes";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_FIXTURE_DAYS = 14;
const FIXTURE_MODELS = ["claude-sonnet-4.5", "gpt-5.1-codex"];
const FIXTURE_REPOSITORIES = ["rudel/web", "rudel/api"];
const FIXTURE_TEAM_CARD_ARCHETYPES = [
	{ key: "maniac", name: "Maniac" },
	{ key: "smooth_operator", name: "Smooth Operator" },
	{ key: "roadrunner", name: "Roadrunner" },
	{ key: "obsessed", name: "Obsessed" },
];

export interface FrontendFixtureMember {
	userId: string;
	displayName: string;
	email: string | null;
	imageUrl: string | null;
}

export interface DashboardFrontendFixtureData {
	errorDashboard: ErrorsDashboard;
	errorDeveloperTrend: ErrorTrendDataPoint[];
	errorProjectTrend: ErrorTrendDataPoint[];
	modelTokensTrend: ModelTokensTrendData[];
	overviewKpis: OverviewKPIs;
	repositoriesDailyTrend: RepositoryDailyTrendData[];
	roiDashboard: ROIDashboard;
	sessionSummaryComparison: SessionAnalyticsSummaryComparison;
	usersDailyTrend: UserDailyTrendData[];
	usersTokenUsage: UserTokenUsageData[];
}

export interface TeamAnalyticsFixtures {
	developerSummaries: DeveloperSummary[];
	teamCards: DeveloperTeamCard[];
}

const defaultFixtureMembers = [
	{
		userId: "fixture-user-1",
		displayName: "Local Designer",
		email: "designer@example.com",
		imageUrl: null,
	},
	{
		userId: "fixture-user-2",
		displayName: "Local Engineer",
		email: "engineer@example.com",
		imageUrl: null,
	},
] satisfies readonly FrontendFixtureMember[];

const announcedFixtureSurfaces = new Set<string>();

export function isFrontendFixturesEnabled() {
	return import.meta.env.DEV && import.meta.env.VITE_FRONTEND_FIXTURES === "1";
}

export function announceFrontendFixturesEnabled(surface: string) {
	if (!isFrontendFixturesEnabled() || announcedFixtureSurfaces.has(surface)) {
		return;
	}

	announcedFixtureSurfaces.add(surface);
	console.info(
		`[rudel] Frontend fixtures are enabled for ${surface}. Live analytics queries are disabled for this surface while VITE_FRONTEND_FIXTURES=1.`,
	);
}

export function buildDashboardFixtureData(input: {
	endDate: string;
	members: readonly FrontendFixtureMember[];
	startDate: string;
}): DashboardFrontendFixtureData {
	const members = getFixtureMembers(input.members);
	const dates = getFixtureDates(input.startDate, input.endDate);
	const usersTokenUsage = buildUserTokenUsage(members);
	const usersDailyTrend = buildUserDailyTrend(members, dates);
	const totalSessions = usersDailyTrend.reduce(
		(total, row) => total + row.sessions,
		0,
	);
	const totalCommits = usersDailyTrend.reduce(
		(total, row) => total + row.total_commits,
		0,
	);
	const totalTokens = usersDailyTrend.reduce(
		(total, row) => total + row.total_tokens,
		0,
	);

	return {
		errorDashboard: buildErrorsDashboard(input.startDate, input.endDate),
		errorDeveloperTrend: buildDeveloperErrorTrend(members, dates),
		errorProjectTrend: buildProjectErrorTrend(dates),
		modelTokensTrend: buildModelTokensTrend(dates),
		overviewKpis: {
			distinct_projects: FIXTURE_REPOSITORIES.length,
			distinct_sessions: totalSessions,
			distinct_skills: 6,
			distinct_slash_commands: 4,
			distinct_subagents: 3,
			distinct_users: members.length,
			total_sessions: totalSessions,
		},
		repositoriesDailyTrend: buildRepositoryDailyTrend(dates),
		roiDashboard: buildRoiDashboard({
			activeDevelopers: members.length,
			dates,
			endDate: input.endDate,
			startDate: input.startDate,
			totalCommits,
			totalSessions,
			totalTokens,
		}),
		sessionSummaryComparison: buildSessionSummaryComparison(totalSessions),
		usersDailyTrend,
		usersTokenUsage,
	};
}

export function buildTeamAnalyticsFixtures(
	membersInput: readonly FrontendFixtureMember[],
): TeamAnalyticsFixtures {
	const members = getFixtureMembers(membersInput);
	const teamCards = members.map((member, index) =>
		buildDeveloperTeamCard(member, index),
	);

	return {
		developerSummaries: teamCards.map((teamCard, index) => ({
			active_days: teamCard.active_days,
			avg_session_duration_min: 42 - index * 4,
			cost: teamCard.cost,
			favorite_model: teamCard.favorite_model,
			input_tokens: teamCard.input_tokens,
			last_active_date: teamCard.last_active_date,
			output_tokens: teamCard.output_tokens,
			success_rate: 84 - index * 3,
			success_rate_trend: index === 0 ? 6 : 2,
			total_duration_min: teamCard.total_sessions * (42 - index * 4),
			total_sessions: teamCard.total_sessions,
			total_tokens: teamCard.total_tokens,
			user_id: teamCard.user_id,
		})),
		teamCards,
	};
}

function getFixtureMembers(members: readonly FrontendFixtureMember[]) {
	const usableMembers = members.filter(
		(member) =>
			member.userId.trim().length > 0 && member.displayName.trim().length > 0,
	);

	return usableMembers.length > 0 ? usableMembers : defaultFixtureMembers;
}

function getFixtureDates(startDateValue: string, endDateValue: string) {
	const parsedStartDate = parseDate(startDateValue);
	const parsedEndDate = parseDate(endDateValue);
	const fallbackEndDate = new Date();
	const endDate = parsedEndDate ?? fallbackEndDate;
	const requestedStartDate =
		parsedStartDate && parsedStartDate <= endDate
			? parsedStartDate
			: new Date(endDate.getTime() - 6 * MS_PER_DAY);
	const dayCount =
		Math.floor(
			(endDate.getTime() - requestedStartDate.getTime()) / MS_PER_DAY,
		) + 1;
	const cappedDayCount = Math.max(1, Math.min(dayCount, MAX_FIXTURE_DAYS));
	const startDate = new Date(
		endDate.getTime() - (cappedDayCount - 1) * MS_PER_DAY,
	);

	return Array.from({ length: cappedDayCount }, (_, index) =>
		formatDate(new Date(startDate.getTime() + index * MS_PER_DAY)),
	);
}

function parseDate(value: string) {
	const date = new Date(`${value}T00:00:00.000Z`);

	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
	return date.toISOString().slice(0, 10);
}

function buildUserTokenUsage(
	members: readonly FrontendFixtureMember[],
): UserTokenUsageData[] {
	return members.map((member, index) => {
		const totalSessions = 18 - index * 4;
		const inputTokens = 360_000 - index * 60_000;
		const outputTokens = 96_000 - index * 18_000;
		const totalTokens = inputTokens + outputTokens;

		return {
			cost: Number(
				(inputTokens * 0.000003 + outputTokens * 0.000015).toFixed(2),
			),
			distinct_skills: 4 - Math.min(index, 2),
			distinct_slash_commands: 3 - Math.min(index, 1),
			input_tokens: inputTokens,
			models_used: FIXTURE_MODELS,
			output_tokens: outputTokens,
			repositories_touched: FIXTURE_REPOSITORIES,
			success_rate: 86 - index * 4,
			total_commits: 11 - index * 3,
			total_duration_min: totalSessions * (42 - index * 3),
			total_sessions: totalSessions,
			total_tokens: totalTokens,
			user_id: member.userId,
			user_label: member.displayName,
		};
	});
}

function buildUserDailyTrend(
	members: readonly FrontendFixtureMember[],
	dates: readonly string[],
): UserDailyTrendData[] {
	return dates.flatMap((date, dayIndex) =>
		members.map((member, memberIndex) => {
			const sessions = Math.max(1, 3 - memberIndex + (dayIndex % 2));
			const inputTokens = sessions * (14_000 + memberIndex * 1_800);
			const outputTokens = sessions * (3_800 + memberIndex * 600);

			return {
				avg_success_rate: 86 - memberIndex * 4,
				date,
				distinct_skills: 3,
				distinct_slash_commands: 2,
				input_tokens: inputTokens,
				models_used: [
					FIXTURE_MODELS[(dayIndex + memberIndex) % FIXTURE_MODELS.length],
				],
				output_tokens: outputTokens,
				repositories_touched: [
					FIXTURE_REPOSITORIES[
						(dayIndex + memberIndex) % FIXTURE_REPOSITORIES.length
					],
				],
				sessions,
				total_commits: Math.max(0, sessions - 1 + (dayIndex % 2)),
				total_hours: Number((sessions * 0.7).toFixed(1)),
				total_tokens: inputTokens + outputTokens,
				user_id: member.userId,
			};
		}),
	);
}

function buildModelTokensTrend(
	dates: readonly string[],
): ModelTokensTrendData[] {
	return dates.flatMap((date, dayIndex) =>
		FIXTURE_MODELS.map((model, modelIndex) => {
			const inputTokens = 80_000 + dayIndex * 4_000 + modelIndex * 14_000;
			const outputTokens = 20_000 + dayIndex * 1_500 + modelIndex * 4_000;

			return {
				date,
				input_tokens: inputTokens,
				model,
				output_tokens: outputTokens,
				total_tokens: inputTokens + outputTokens,
			};
		}),
	);
}

function buildRepositoryDailyTrend(
	dates: readonly string[],
): RepositoryDailyTrendData[] {
	return dates.flatMap((date, dayIndex) =>
		FIXTURE_REPOSITORIES.map((repository, repositoryIndex) => ({
			date,
			repository,
			sessions: 4 + ((dayIndex + repositoryIndex) % 4),
			total_commits: 2 + ((dayIndex + repositoryIndex) % 3),
		})),
	);
}

function buildRoiDashboard(input: {
	activeDevelopers: number;
	dates: readonly string[];
	endDate: string;
	startDate: string;
	totalCommits: number;
	totalSessions: number;
	totalTokens: number;
}): ROIDashboard {
	const totalCost = Number((input.totalTokens * 0.000004).toFixed(2));
	const devHoursSaved = Number((input.totalCommits * 1.25).toFixed(1));
	const dollarValueSaved = devHoursSaved * 100;

	return {
		assumptions: {
			code_percentage: 0.3,
			developer_hourly_rate: 100,
			fallback_input_price_per_million: 3,
			fallback_output_price_per_million: 15,
			loc_per_hour: 60,
			priced_model_entries: 1,
			pricing_mode: ESTIMATED_PRICING_MODE,
			tokens_per_loc: 12,
		},
		comparison_end_date: input.startDate,
		comparison_start_date: input.startDate,
		developer_breakdown: [],
		end_date: input.endDate,
		project_breakdown: [],
		start_date: input.startDate,
		summary: {
			active_developers: input.activeDevelopers,
			avg_success_score: 86,
			commits_per_dollar: Number((input.totalCommits / totalCost).toFixed(2)),
			dev_hours_saved: devHoursSaved,
			dev_hours_saved_change_pct: 8,
			dollar_value_saved: dollarValueSaved,
			dollar_value_saved_change_pct: 8,
			roi_percentage: Number(
				(
					((dollarValueSaved - totalCost) / Math.max(totalCost, 1)) *
					100
				).toFixed(1),
			),
			roi_percentage_change_pct: 11,
			sessions_per_dollar: Number((input.totalSessions / totalCost).toFixed(2)),
			total_commits: input.totalCommits,
			total_cost: totalCost,
			total_cost_change_pct: 4,
			total_sessions: input.totalSessions,
		},
		trend: input.dates.map((date, index) => ({
			bucket_label: date.slice(5),
			bucket_start: date,
			commits_per_dollar: 0.8 + index * 0.03,
			dev_hours_saved: 2 + index * 0.2,
			dollar_value_saved: 200 + index * 18,
			roi_percentage: 280 + index * 5,
			sessions_per_dollar: 1.4 + index * 0.04,
			total_commits: 4 + (index % 3),
			total_cost: 7 + index,
			total_sessions: 7 + (index % 4),
		})),
		trend_interval: "day",
	};
}

function buildErrorsDashboard(
	startDate: string,
	endDate: string,
): ErrorsDashboard {
	return {
		end_date: endDate,
		recurring: [
			{
				affected_sessions: 3,
				affected_users: 2,
				error_pattern: "Fixture API boundary error",
				last_seen: endDate,
				occurrences: 5,
				repositories: ["rudel/web"],
				severity: "low",
			},
		],
		start_date: startDate,
		summary: {
			distinct_patterns: 1,
			high_severity_patterns: 0,
			max_affected_users: 2,
			top_error_pattern: "Fixture API boundary error",
			total_errors: 5,
		},
	};
}

function buildProjectErrorTrend(
	dates: readonly string[],
): ErrorTrendDataPoint[] {
	return dates.map((date, index) => ({
		avg_errors_per_interaction: Number((0.02 + index * 0.001).toFixed(3)),
		avg_errors_per_session: Number((0.12 + index * 0.01).toFixed(2)),
		date,
		dimension: FIXTURE_REPOSITORIES[index % FIXTURE_REPOSITORIES.length],
		error_type_occurrences: [index + 1],
		error_types: ["FixtureError"],
		total_errors: 1 + (index % 3),
	}));
}

function buildDeveloperErrorTrend(
	members: readonly FrontendFixtureMember[],
	dates: readonly string[],
): ErrorTrendDataPoint[] {
	return dates.flatMap((date, dateIndex) =>
		members.map((member, memberIndex) => ({
			avg_errors_per_interaction: 0.01,
			avg_errors_per_session: Number((0.06 + memberIndex * 0.02).toFixed(2)),
			date,
			dimension: member.userId,
			error_type_occurrences: [dateIndex + memberIndex + 1],
			error_types: ["FixtureError"],
			total_errors: (dateIndex + memberIndex) % 2,
		})),
	);
}

function buildSessionSummaryComparison(
	totalSessions: number,
): SessionAnalyticsSummaryComparison {
	return {
		changes: {
			avg_response_time_sec: -0.3,
			avg_session_duration_min: 4,
			total_sessions: 8,
		},
		current: {
			avg_response_time_sec: 3.1,
			avg_session_duration_min: 41,
			skills_adoption_rate: 62,
			slash_commands_adoption_rate: 44,
			subagents_adoption_rate: 33,
			total_sessions: totalSessions,
		},
		previous: {
			avg_response_time_sec: 3.4,
			avg_session_duration_min: 37,
			skills_adoption_rate: 58,
			slash_commands_adoption_rate: 40,
			subagents_adoption_rate: 29,
			total_sessions: Math.max(0, totalSessions - 8),
		},
	};
}

function buildDeveloperTeamCard(
	member: FrontendFixtureMember,
	index: number,
): DeveloperTeamCard {
	const inputTokens = 420_000 - index * 70_000;
	const outputTokens = 110_000 - index * 20_000;
	const totalTokens = inputTokens + outputTokens;

	return {
		active_days: 8 - Math.min(index, 4),
		archetype:
			FIXTURE_TEAM_CARD_ARCHETYPES[index % FIXTURE_TEAM_CARD_ARCHETYPES.length],
		cost: Number((inputTokens * 0.000003 + outputTokens * 0.000015).toFixed(2)),
		display_name: member.displayName,
		favorite_model: FIXTURE_MODELS[index % FIXTURE_MODELS.length],
		input_tokens: inputTokens,
		last_active_date: formatDate(new Date()),
		output_tokens: outputTokens,
		top_skills: [
			{ count: 12 - index, name: "typescript" },
			{ count: 8 - index, name: "debugging" },
		],
		total_sessions: 22 - index * 4,
		total_tokens: totalTokens,
		user_id: member.userId,
	};
}
