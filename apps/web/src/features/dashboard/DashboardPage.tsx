import {
	Activity,
	Bot,
	FolderKanban,
	Sparkles,
	Terminal,
	Users,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { CliSetupHint } from "@/components/analytics/CliSetupHint";
import { NoSessionsInRange } from "@/components/analytics/NoSessionsInRange";
import { ModelTokensChart } from "@/components/charts/ModelTokensChart";
import { UsageTrendChart } from "@/components/charts/UsageTrendChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import {
	type DashboardInsightItem,
	DashboardInsightsPanel,
} from "@/features/dashboard/components/DashboardInsightsPanel";
import { DashboardMetricCard } from "@/features/dashboard/components/DashboardMetricCard";
import { useDashboardHomeData } from "@/features/dashboard/use-dashboard-home-data";
import { useDashboardAnalytics } from "@/hooks/useDashboardAnalytics";
import {
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import {
	captureDashboardLoadFailed,
	getHttpStatusFromError,
	normalizeWebErrorCode,
} from "@/lib/product-analytics";

type InsightLink = {
	link?: string | null;
	message: string;
	severity: "critical" | "negative" | "warning" | "info" | "positive";
	type: "trend" | "performer" | "alert" | "info";
};

function deriveInsightKey(insight: InsightLink) {
	return `${insight.type}:${insight.message}:${insight.link ?? "/dashboard"}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 96);
}

function formatMetricValue(value: number) {
	return value.toLocaleString();
}

export function DashboardPage() {
	const {
		hasAnySessions,
		hasData,
		insights,
		insightsError,
		insightsLoading,
		kpis,
		kpisError,
		kpisLoading,
		kpisQueryError,
		modelTokensData,
		modelTokensError,
		modelTokensLoading,
		startDate,
		endDate,
		usageTrendData,
		usageTrendError,
		usageTrendLoading,
	} = useDashboardHomeData();
	const failedRangeKeyRef = useRef<string | null>(null);
	const { organizationId, userId, pageName, dateRangeDays } =
		useDashboardAnalytics();

	const homeSections: DashboardSection[] = [
		{
			id: "metric_cards",
			itemCount: hasData ? 6 : 0,
			state: kpisError ? "error" : hasData ? "populated" : "empty",
		},
		{
			id: "insights",
			itemCount: insights.length,
			state: insightsError
				? "error"
				: insights.length > 0
					? "populated"
					: "empty",
		},
		{
			id: "usage_trend",
			itemCount: usageTrendData.length,
			state: usageTrendError
				? "error"
				: usageTrendData.length > 0
					? "populated"
					: "empty",
		},
		{
			id: "model_tokens",
			itemCount: modelTokensData.length,
			state: modelTokensError
				? "error"
				: modelTokensData.length > 0
					? "populated"
					: "empty",
		},
	];

	useTrackDashboardView({
		hasData,
		insightCount: insightsError ? 0 : insights.length,
		isError: kpisError,
		isLoading:
			kpisLoading || insightsLoading || usageTrendLoading || modelTokensLoading,
		metrics: [
			{ id: "distinct_users", value: kpis?.distinct_users },
			{ id: "distinct_sessions", value: kpis?.distinct_sessions },
			{ id: "distinct_projects", value: kpis?.distinct_projects },
			{ id: "distinct_subagents", value: kpis?.distinct_subagents },
			{ id: "distinct_slash_commands", value: kpis?.distinct_slash_commands },
			{ id: "distinct_skills", value: kpis?.distinct_skills },
		],
		sections: homeSections,
	});

	useEffect(() => {
		if (
			!organizationId ||
			!userId ||
			pageName !== "overview" ||
			dateRangeDays == null
		) {
			return;
		}

		if (!kpisLoading && kpisError) {
			const failedRangeKey = `${organizationId}:${pageName}:${startDate}:${endDate}`;
			if (failedRangeKeyRef.current === failedRangeKey) {
				return;
			}

			failedRangeKeyRef.current = failedRangeKey;
			captureDashboardLoadFailed({
				organization_id: organizationId,
				user_id: userId,
				page_name: pageName,
				query_name: "overview_kpis",
				error_code: normalizeWebErrorCode(kpisQueryError),
				date_range_days: dateRangeDays,
				http_status: getHttpStatusFromError(kpisQueryError),
				is_blocking: true,
			});
		}
	}, [
		dateRangeDays,
		endDate,
		kpisError,
		kpisLoading,
		kpisQueryError,
		organizationId,
		pageName,
		startDate,
		userId,
	]);

	return (
		<div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),transparent_32%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.07),transparent_28%)]">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:px-8">
				<section className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(22rem,0.95fr)]">
					<Card className="border-slate-200/80 bg-white/95 shadow-[0_32px_80px_-52px_rgba(15,23,42,0.45)] dark:border-slate-800/80 dark:bg-slate-950/70">
						<CardContent className="flex h-full flex-col gap-6 p-6 lg:p-8">
							<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
								<div className="max-w-2xl">
									<Badge
										variant="outline"
										className="rounded-full border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200"
									>
										Dashboard home
									</Badge>
									<h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-slate-50">
										Team activity at a glance
									</h1>
									<p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base dark:text-slate-300">
										The landing page now focuses on the signals that help you
										orient quickly: developer activity, session volume, project
										coverage, and model usage.
									</p>
								</div>
								<div className="shrink-0">
									<DashboardDateControls />
								</div>
							</div>

							<div className="flex flex-wrap gap-3">
								<Button asChild variant="outline">
									<Link to="/dashboard/developers">Developers</Link>
								</Button>
								<Button asChild variant="outline">
									<Link to="/dashboard/projects">Projects</Link>
								</Button>
								<Button asChild variant="outline">
									<Link to="/dashboard/sessions">Sessions</Link>
								</Button>
							</div>

							{hasData && kpis ? (
								<div className="grid gap-3 sm:grid-cols-3">
									<HeroSummary
										label="Developers"
										value={formatMetricValue(kpis.distinct_users)}
									/>
									<HeroSummary
										label="Sessions"
										value={formatMetricValue(kpis.distinct_sessions)}
									/>
									<HeroSummary
										label="Projects"
										value={formatMetricValue(kpis.distinct_projects)}
									/>
								</div>
							) : null}
						</CardContent>
					</Card>

					<DashboardInsightsPanel insights={buildDashboardInsights(insights)} />
				</section>

				{kpisLoading ? <DashboardLoadingState /> : null}

				{!kpisLoading && !hasData && hasAnySessions ? (
					<NoSessionsInRange />
				) : null}

				{!kpisLoading && (kpisError || !hasAnySessions) ? (
					<CliSetupHint />
				) : null}

				{hasData && kpis ? (
					<>
						<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
							<DashboardMetricCard
								description="Inspect individual contributors"
								icon={Users}
								title="Distinct users"
								to="/dashboard/developers"
								value={formatMetricValue(kpis.distinct_users)}
							/>
							<DashboardMetricCard
								description="Review session activity"
								icon={Activity}
								title="Distinct sessions"
								to="/dashboard/sessions"
								value={formatMetricValue(kpis.distinct_sessions)}
							/>
							<DashboardMetricCard
								description="See project coverage"
								icon={FolderKanban}
								title="Distinct projects"
								to="/dashboard/projects"
								value={formatMetricValue(kpis.distinct_projects)}
							/>
							<DashboardMetricCard
								description="Track automation footprint"
								icon={Bot}
								title="Distinct subagents"
								to="/dashboard/sessions"
								value={formatMetricValue(kpis.distinct_subagents)}
							/>
							<DashboardMetricCard
								description="Understand command usage"
								icon={Terminal}
								title="Slash commands"
								to="/dashboard/sessions"
								value={formatMetricValue(kpis.distinct_slash_commands)}
							/>
							<DashboardMetricCard
								description="Find reusable workflows"
								icon={Sparkles}
								title="Distinct skills"
								to="/dashboard/sessions"
								value={formatMetricValue(kpis.distinct_skills)}
							/>
						</section>

						{usageTrendData.length > 0 ? (
							<Card className="border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] dark:border-slate-800/80 dark:bg-slate-950/70">
								<CardHeader>
									<CardTitle className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
										Usage trend
									</CardTitle>
									<CardDescription>
										Compare sessions, tokens, active users, and hours in one
										place.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<UsageTrendChart
										data={usageTrendData}
										showRollingAverage={false}
									/>
								</CardContent>
							</Card>
						) : null}

						{modelTokensData.length > 0 ? (
							<Card className="border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] dark:border-slate-800/80 dark:bg-slate-950/70">
								<CardHeader>
									<CardTitle className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
										Model token mix
									</CardTitle>
									<CardDescription>
										Token consumption broken down by model over time.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<ModelTokensChart data={modelTokensData} />
								</CardContent>
							</Card>
						) : null}
					</>
				) : null}
			</div>
		</div>
	);
}

function HeroSummary({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/80">
			<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
				{label}
			</p>
			<p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
				{value}
			</p>
		</div>
	);
}

function DashboardLoadingState() {
	return (
		<section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
			<Card className="border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] dark:border-slate-800/80 dark:bg-slate-950/70">
				<CardContent className="flex h-full min-h-72 flex-col items-center justify-center gap-4 p-8">
					<Spinner size="lg" />
					<div className="text-center">
						<p className="text-base font-medium text-slate-900 dark:text-slate-100">
							Loading dashboard home
						</p>
						<p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
							Gathering usage, model, and insight data for the selected range.
						</p>
					</div>
				</CardContent>
			</Card>
			<Card className="border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] dark:border-slate-800/80 dark:bg-slate-950/70">
				<CardContent className="space-y-3 p-6">
					<div className="h-6 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
					<div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
					<div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
					<div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
				</CardContent>
			</Card>
		</section>
	);
}

function buildDashboardInsights(
	insights: readonly InsightLink[],
): DashboardInsightItem[] {
	return insights.map((insight) => ({
		insightKey: deriveInsightKey(insight),
		link: insight.link ?? "/dashboard",
		message: insight.message,
		severity: insight.severity,
		type: insight.type,
	}));
}
