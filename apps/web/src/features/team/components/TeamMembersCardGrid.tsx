import { ArrowUpRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { TeamInviteLinkSurface } from "@/features/team/components/TeamInviteLinkSurface";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { resolveWrappedArchetypeCardThemeByClassifierKey } from "@/features/wrapped/team-card/archetypes";
import { WrappedTeamCardArtboardFrame } from "@/features/wrapped/team-card/artboard-frame";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
} from "@/features/wrapped/team-card/card";
import { UNKNOWN_GUEST_CARD_PRESET } from "@/features/wrapped/wrapped-guest-card-presets";
import "@/features/wrapped/wrapped.css";

const TEAM_CARD_UNCLASSIFIED_ARCHETYPE_LABEL = "Unclassified";

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

function buildHeaderLeftMetric(row: TeamPageMemberRow) {
	const formattedSpend = formatSpendValue(row.cost);

	return {
		title: `${currencyFormatter.format(row.cost ?? 0)} estimated API-rate cost`,
		value: formattedSpend,
	} satisfies WrappedTeamMemberCardHeaderMetric;
}

function buildHeaderRightMetric(label: string) {
	return {
		title: label,
		value: label,
	} satisfies WrappedTeamMemberCardHeaderMetric;
}

function resolveTeamCardPresentation(row: TeamPageMemberRow) {
	const archetypeTheme = resolveWrappedArchetypeCardThemeByClassifierKey(
		row.archetype?.key,
	);
	const archetypeLabel =
		archetypeTheme?.displayLabel ??
		row.archetype?.name ??
		TEAM_CARD_UNCLASSIFIED_ARCHETYPE_LABEL;

	return {
		archetypeLabel,
		shellClassName:
			archetypeTheme?.shellClassName ??
			UNKNOWN_GUEST_CARD_PRESET.shellClassName,
		theme: archetypeTheme?.theme ?? UNKNOWN_GUEST_CARD_PRESET.theme,
	};
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

function formatSpendValue(cost: number | null) {
	const resolvedCost = cost ?? 0;
	if (resolvedCost === 0) {
		return "$0";
	}

	if (Math.abs(resolvedCost) >= 1000) {
		return compactCurrencyFormatter.format(resolvedCost);
	}

	if (Math.abs(resolvedCost) >= 100) {
		return currencyFormatter.format(resolvedCost).replace(/\.00$/, "");
	}

	return currencyFormatter.format(resolvedCost);
}

function isCurrentUserTeamCard(
	row: TeamPageMemberRow,
	currentUserId: string | null,
) {
	return currentUserId !== null && row.userId === currentUserId;
}

function TeamMemberShareCardShell({
	children,
	isCurrentUserCard,
}: {
	children: ReactNode;
	isCurrentUserCard: boolean;
}) {
	return (
		<div className="group/team-share-card relative h-[358px] w-[233px]">
			{children}
			{isCurrentUserCard ? (
				<Link
					className={buttonVariants({
						className:
							"pointer-events-none absolute right-2 bottom-2 left-2 z-20 h-10 translate-y-1 rounded-[10px] px-3 text-sm font-semibold opacity-0 shadow-none transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] group-hover/team-share-card:pointer-events-auto group-hover/team-share-card:translate-y-0 group-hover/team-share-card:opacity-100 focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:opacity-100",
						size: "sm",
						variant: "secondary",
					})}
					rel="noreferrer"
					target="_blank"
					to={appRoutes.wrappedTeamCardShare()}
				>
					<span>View sharing page</span>
					<ArrowUpRightIcon aria-hidden="true" className="size-4" />
				</Link>
			) : null}
		</div>
	);
}

function TeamCardShapePlaceholder({
	organizationId,
}: {
	organizationId: string;
}) {
	return (
		<WrappedTeamCardArtboardFrame>
			<article
				aria-label="Add more members"
				className="relative isolate grid h-[358px] w-[233px] place-items-center overflow-hidden rounded-[18px] bg-muted/45 p-6 text-card-foreground shadow-none"
			>
				<svg
					aria-hidden="true"
					className="absolute inset-0 size-full text-muted-foreground/35"
					fill="none"
					viewBox="0 0 233 358"
				>
					<rect
						x="4"
						y="4"
						width="225"
						height="350"
						rx="15"
						stroke="currentColor"
						strokeDasharray="18 12"
						strokeLinecap="round"
						strokeWidth="6"
					/>
				</svg>
				<div className="relative z-10 flex w-full flex-col items-center gap-3">
					<p className="max-w-[19ch] text-center text-sm font-medium text-pretty text-muted-foreground">
						Add more members to your team with this link
					</p>
					<TeamInviteLinkSurface organizationId={organizationId} />
				</div>
			</article>
		</WrappedTeamCardArtboardFrame>
	);
}

export function TeamMembersCardGrid({
	canInviteTeamMembers,
	currentUserId,
	organizationId,
	rows,
}: {
	canInviteTeamMembers: boolean;
	currentUserId: string | null;
	organizationId: string | null;
	rows: TeamPageMemberRow[];
}) {
	return (
		<div className="team-lineup-surface-scope">
			<ul className="grid justify-center gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(233px,233px))]">
				{canInviteTeamMembers && organizationId ? (
					<li className="flex justify-center list-none">
						<TeamCardShapePlaceholder
							key={organizationId}
							organizationId={organizationId}
						/>
					</li>
				) : null}
				{rows.map((row) => {
					const isCurrentUserCard = isCurrentUserTeamCard(row, currentUserId);
					const teamCardPresentation = resolveTeamCardPresentation(row);
					const card = (
						<WrappedTeamMemberCard
							disableOuterShadow={false}
							headerLeftMetric={buildHeaderLeftMetric(row)}
							headerRightMetric={buildHeaderRightMetric(
								teamCardPresentation.archetypeLabel,
							)}
							hideHeaderLogo
							layoutPreset="team-card-preview"
							mediaPanelClassName="mx-auto"
							row={row}
							shellClassName={teamCardPresentation.shellClassName}
							shellStyle={UNKNOWN_GUEST_CARD_PRESET.shellStyle}
							statItems={buildTeamCardStats(row)}
							statTileClassName=""
							theme={teamCardPresentation.theme}
						/>
					);

					return (
						<li key={row.userId} className="flex justify-center list-none">
							<TeamMemberShareCardShell isCurrentUserCard={isCurrentUserCard}>
								{card}
							</TeamMemberShareCardShell>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
