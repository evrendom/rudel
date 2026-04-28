import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
} from "@/features/wrapped/team-card/card";
import { UNKNOWN_GUEST_CARD_PRESET } from "@/features/wrapped/wrapped-guest-card-presets";
import "@/features/wrapped/wrapped.css";

const TEAM_CARD_PENDING_ARCHETYPE_LABEL = "To be revealed";

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 1,
	notation: "compact",
	style: "currency",
});

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	style: "currency",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
});

const pendingArchetypeMetric = {
	title: TEAM_CARD_PENDING_ARCHETYPE_LABEL,
	value: TEAM_CARD_PENDING_ARCHETYPE_LABEL,
} satisfies WrappedTeamMemberCardHeaderMetric;

function buildHeaderLeftMetric(row: TeamPageMemberRow) {
	const formattedSpend = formatSpendValue(row.cost);

	return {
		title: `${currencyFormatter.format(row.cost)} estimated spend`,
		value: formattedSpend,
	} satisfies WrappedTeamMemberCardHeaderMetric;
}

function buildTeamCardStats(
	row: TeamPageMemberRow,
): readonly WrappedTeamMemberCardStatItem[] {
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
			title: `${row.activeDays.toLocaleString()} active days`,
			value: row.activeDays.toLocaleString(),
		},
		{
			key: "tokens",
			label: "TOK",
			title:
				row.totalTokens > 0
					? `${row.totalTokens.toLocaleString()} total tokens`
					: "No traced tokens yet.",
			value: formatCompactNumber(row.totalTokens),
		},
		{
			key: "last",
			label: "LAST",
			title: row.lastActiveDate ?? "No recent activity",
			value: formatShortDate(row.lastActiveDate),
		},
		{
			key: "input",
			label: "IN",
			title: `${row.inputTokens.toLocaleString()} input tokens`,
			value: formatCompactNumber(row.inputTokens),
		},
		{
			key: "output",
			label: "OUT",
			title: `${row.outputTokens.toLocaleString()} output tokens`,
			value: formatCompactNumber(row.outputTokens),
		},
	];
}

function formatCompactNumber(value: number) {
	return compactNumberFormatter.format(Math.max(0, value));
}

function formatShortDate(lastActiveDate: string | null) {
	if (!lastActiveDate) {
		return "None";
	}

	const parsedDate = new Date(lastActiveDate);

	if (Number.isNaN(parsedDate.getTime())) {
		return lastActiveDate;
	}

	return shortDateFormatter.format(parsedDate);
}

function formatSpendValue(cost: number) {
	if (cost === 0) {
		return "$0";
	}

	if (Math.abs(cost) >= 1000) {
		return compactCurrencyFormatter.format(cost);
	}

	if (Math.abs(cost) >= 100) {
		return currencyFormatter.format(cost).replace(/\.00$/, "");
	}

	return currencyFormatter.format(cost);
}

export function TeamMembersCardGrid({ rows }: { rows: TeamPageMemberRow[] }) {
	return (
		<div className="team-lineup-surface-scope">
			<ul className="grid justify-center gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(233px,233px))]">
				{rows.map((row) => (
					<li key={row.userId} className="list-none">
						<WrappedTeamMemberCard
							disableOuterShadow={false}
							headerLeftMetric={buildHeaderLeftMetric(row)}
							headerRightMetric={pendingArchetypeMetric}
							hideHeaderLogo
							layoutPreset="team-card-preview"
							mediaPanelClassName="mx-auto"
							row={row}
							shellClassName={UNKNOWN_GUEST_CARD_PRESET.shellClassName}
							shellStyle={UNKNOWN_GUEST_CARD_PRESET.shellStyle}
							statItems={buildTeamCardStats(row)}
							statTileClassName=""
							theme={UNKNOWN_GUEST_CARD_PRESET.theme}
						/>
					</li>
				))}
			</ul>
		</div>
	);
}
