import type { DimensionAnalysisDataPoint } from "@rudel/api-routes";
import { useEffect, useMemo } from "react";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	TeamMemberCard,
	type TeamMemberCardHeaderMetric,
	type TeamMemberCardStatItem,
} from "@/features/team/components/TeamMembersCardGrid";
import {
	type TeamPageMemberRow,
	useTeamPageData,
} from "@/features/team/use-team-page-data";
import { useWalkInCardData } from "@/features/walk-in/use-walk-in-card-data";
import {
	TEAM_CARD_PREVIEW_ACTIONS,
	WalkInPreviewColumn,
} from "@/features/walk-in/WalkInPreviewColumn";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import {
	formatCompactWholeCurrency,
	formatCompactWholeNumber,
} from "@/lib/format";
import { orpc } from "@/lib/orpc";
import "@/features/walk-in/walk-in-clone.css";

export function TeamCardWalkInPage() {
	const {
		accountLabel,
		cardModel,
		handover,
		session,
		wrappedData,
		wrappedDataState,
	} = useWalkInCardData();
	const { teamMemberRows } = useTeamPageData();
	const sessionUserId = getSessionUserId(session);
	const sessionUserImage = getSessionUserImage(session);
	const longestSessionQuery = useAnalyticsQuery({
		...orpc.analytics.developers.sessions.queryOptions({
			input: {
				userId: sessionUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
				outcome: "all",
				limit: 1,
				offset: 0,
				sortBy: "duration",
				sortOrder: "desc",
			},
		}),
		enabled: Boolean(sessionUserId),
	});
	const archetypeBreakdownQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: MAX_ANALYTICS_DAYS,
				dimension: "session_archetype",
				metric: "session_count",
				limit: 8,
				userId: sessionUserId ?? undefined,
			},
		}),
		enabled: Boolean(sessionUserId),
	});
	const visibleTeamCardRow = useMemo(
		() =>
			pickVisibleTeamCardRow(
				teamMemberRows,
				sessionUserId,
				getFallbackTeamMemberDisplayName(accountLabel),
				sessionUserImage,
			),
		[accountLabel, sessionUserId, sessionUserImage, teamMemberRows],
	);
	const dominantArchetype = useMemo(
		() => findTopDimensionValue(archetypeBreakdownQuery.data),
		[archetypeBreakdownQuery.data],
	);
	const longestSessionMin = useMemo(
		() => Number(longestSessionQuery.data?.[0]?.duration_min) || 0,
		[longestSessionQuery.data],
	);
	const headerLeftMetric = useMemo<TeamMemberCardHeaderMetric>(
		() => ({
			label: "SPEND",
			title: `${formatCompactWholeCurrency(visibleTeamCardRow.cost)} estimated spend`,
			value: formatCompactWholeCurrency(visibleTeamCardRow.cost),
		}),
		[visibleTeamCardRow.cost],
	);
	const headerRightMetric = useMemo<TeamMemberCardHeaderMetric>(
		() => ({
			title: dominantArchetype || undefined,
			value: dominantArchetype,
		}),
		[dominantArchetype],
	);
	const statItems = useMemo(
		() => buildWalkInStatItems(visibleTeamCardRow, longestSessionMin),
		[longestSessionMin, visibleTeamCardRow],
	);

	useEffect(() => {
		document.body.classList.add("mymind-walk-in-body");

		return () => {
			document.body.classList.remove("mymind-walk-in-body");
		};
	}, []);

	return (
		<main className="mymind-walk-in-route [--team-lineup-card-grain-size:64px] [--team-lineup-featured-panel-noise-large-size:120px] [--team-lineup-featured-panel-noise-small-size:56px]">
			<section className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-6 py-10 text-foreground sm:px-8 lg:grid-cols-[minmax(20rem,34rem)_minmax(18rem,1fr)] lg:gap-12 lg:px-12">
				<div className="team-lineup-surface-scope flex w-full justify-center lg:justify-start">
					<div className="flex h-[34rem] w-full max-w-[30rem] items-center justify-center sm:h-[37rem]">
						<div className="origin-center scale-[1.42] sm:scale-[1.56] lg:scale-[1.72]">
							<ul className="grid justify-center p-0">
								<TeamMemberCard
									headerLeftMetric={headerLeftMetric}
									headerRightMetric={headerRightMetric}
									row={visibleTeamCardRow}
									mediaPanelClassName="mx-auto aspect-square w-[9.875rem]"
									statItems={statItems}
									statTileClassName="min-h-[40px] bg-[#fcfcfc] shadow-[inset_0_2px_0_rgba(255,255,255,0.98)]"
								/>
							</ul>
						</div>
					</div>
				</div>

				<WalkInPreviewColumn
					actions={TEAM_CARD_PREVIEW_ACTIONS}
					cardModel={cardModel}
					handover={handover}
					wrappedData={wrappedData}
					wrappedDataState={wrappedDataState}
				/>
			</section>
		</main>
	);
}

function pickVisibleTeamCardRow(
	teamMemberRows: readonly TeamPageMemberRow[],
	sessionUserId: string | undefined,
	fallbackDisplayName: string,
	fallbackImageUrl: string | undefined,
): TeamPageMemberRow {
	if (sessionUserId) {
		const currentUserRow = teamMemberRows.find(
			(row) => row.userId === sessionUserId,
		);

		if (currentUserRow) {
			return currentUserRow;
		}
	}

	return buildFallbackTeamMemberRow(fallbackDisplayName, fallbackImageUrl);
}

function buildFallbackTeamMemberRow(
	displayName: string,
	imageUrl: string | undefined,
): TeamPageMemberRow {
	return {
		activeDays: 0,
		cost: 0,
		displayName,
		email: null,
		favoriteModel: null,
		hasActivity: false,
		imageUrl: imageUrl ?? "/walk-in-profile.png",
		inputTokens: 0,
		lastActiveDate: null,
		outputTokens: 0,
		role: "Tracked collaborator",
		totalSessions: 0,
		totalTokens: 0,
		userId: "walk-in-preview",
	};
}

function buildWalkInStatItems(
	row: TeamPageMemberRow,
	longestSessionMin: number,
): TeamMemberCardStatItem[] {
	const lockInLabel = formatDurationLabel(longestSessionMin);

	return [
		{
			key: "sessions",
			label: "SESS",
			title: `${row.totalSessions.toLocaleString()} sessions`,
			value: row.totalSessions.toLocaleString(),
		},
		{
			key: "days",
			label: "DAYS",
			title: `${row.activeDays.toLocaleString()} active days across ${MAX_ANALYTICS_DAYS.toLocaleString()} tracked days`,
			value: `${row.activeDays.toLocaleString()} / ${MAX_ANALYTICS_DAYS.toLocaleString()}`,
		},
		{
			key: "tokens",
			label: "TOK",
			title: `${row.totalTokens.toLocaleString()} total tokens`,
			value: formatCompactWholeNumber(row.totalTokens),
		},
		{
			key: "lock-in",
			label: "LOCK",
			title: `${lockInLabel} longest session`,
			value: lockInLabel,
		},
	];
}

function getSessionUserId(
	session: ReturnType<typeof useWalkInCardData>["session"],
) {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
		: undefined;
}

function formatDurationLabel(totalMinutes: number) {
	const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
	const hours = Math.floor(normalizedMinutes / 60);
	const minutes = normalizedMinutes % 60;

	if (hours <= 0) {
		return `${minutes}m`;
	}

	if (minutes <= 0) {
		return `${hours}h`;
	}

	return `${hours}h ${minutes}m`;
}

function getFallbackTeamMemberDisplayName(accountLabel: string): string {
	if (accountLabel.includes("@")) {
		return accountLabel.split("@")[0] || "User";
	}

	return accountLabel || "User";
}

function getSessionUserImage(
	session: ReturnType<typeof useWalkInCardData>["session"],
) {
	return session?.user &&
		"image" in session.user &&
		typeof session.user.image === "string"
		? session.user.image
		: undefined;
}

function findTopDimensionValue(
	rows: readonly DimensionAnalysisDataPoint[] | undefined,
) {
	const topRow = [...(rows ?? [])].sort(
		(leftRow, rightRow) =>
			Number(rightRow.metric_value) - Number(leftRow.metric_value) ||
			leftRow.dimension_value.localeCompare(rightRow.dimension_value),
	)[0];

	return formatSessionArchetypeLabel(topRow?.dimension_value);
}

function formatSessionArchetypeLabel(value: string | null | undefined) {
	if (!value) {
		return "—";
	}

	return value
		.trim()
		.replaceAll(/[_-]+/g, " ")
		.replaceAll(/\b\w/g, (character) => character.toUpperCase());
}
