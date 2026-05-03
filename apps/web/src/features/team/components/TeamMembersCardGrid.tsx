import { LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { resolveWrappedArchetypeCardThemeByClassifierKey } from "@/features/wrapped/team-card/archetypes";
import { WrappedTeamCardArtboardFrame } from "@/features/wrapped/team-card/artboard-frame";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
} from "@/features/wrapped/team-card/card";
import { UNKNOWN_GUEST_CARD_PRESET } from "@/features/wrapped/wrapped-guest-card-presets";
import { copyTextToClipboardWithResult } from "@/lib/clipboard";
import "@/features/wrapped/wrapped.css";

const TEAM_CARD_UNCLASSIFIED_ARCHETYPE_LABEL = "Unclassified";
const TEAM_LINK_COPY_RESET_MS = 1800;

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
		title: `${currencyFormatter.format(row.cost)} estimated spend`,
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

function TeamCardShapePlaceholder({
	isInviteLinkPending,
	teamInviteLink,
}: {
	isInviteLinkPending: boolean;
	teamInviteLink: string | null;
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
					<TeamLinkCopySurface
						isInviteLinkPending={isInviteLinkPending}
						teamInviteLink={teamInviteLink}
					/>
				</div>
			</article>
		</WrappedTeamCardArtboardFrame>
	);
}

function TeamLinkCopySurface({
	isInviteLinkPending,
	teamInviteLink,
}: {
	isInviteLinkPending: boolean;
	teamInviteLink: string | null;
}) {
	const [copied, setCopied] = useState(false);
	const resetTimeoutRef = useRef<number | null>(null);
	const visibleTeamLink =
		teamInviteLink ??
		(isInviteLinkPending ? "Loading link..." : "Link unavailable");

	useEffect(() => {
		return () => {
			if (resetTimeoutRef.current !== null) {
				window.clearTimeout(resetTimeoutRef.current);
			}
		};
	}, []);

	async function handleCopyTeamLink() {
		if (!teamInviteLink) {
			return;
		}

		const result = await copyTextToClipboardWithResult(teamInviteLink, {
			preferSelectionCopy: true,
			allowPromptFallback: true,
			promptMessage: "Copy team link: Cmd/Ctrl+C, Enter",
		});

		if (result !== "copied") {
			return;
		}

		if (resetTimeoutRef.current !== null) {
			window.clearTimeout(resetTimeoutRef.current);
		}

		setCopied(true);
		resetTimeoutRef.current = window.setTimeout(() => {
			setCopied(false);
			resetTimeoutRef.current = null;
		}, TEAM_LINK_COPY_RESET_MS);
	}

	return (
		<div className="grid h-11 w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-1 rounded-full border border-border/60 bg-background p-1">
			<LinkIcon
				aria-hidden="true"
				className="mx-auto size-4 shrink-0 text-muted-foreground"
			/>
			<div
				className="min-w-0 truncate [font-family:var(--font-mono)] text-[0.82rem] font-medium text-[#22201f]"
				title={visibleTeamLink}
			>
				{visibleTeamLink}
			</div>
			<button
				aria-label={copied ? "Copied team link" : "Copy team link"}
				className="flex h-full min-w-18 items-center justify-center rounded-full bg-[#22201f] px-4 [font-family:var(--font-sans)] text-[0.86rem] font-bold text-[#fffaf5] transition-colors hover:bg-[#151312] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22201f]/30 disabled:cursor-not-allowed disabled:bg-muted-foreground/40 disabled:text-background"
				disabled={isInviteLinkPending || teamInviteLink === null}
				onClick={() => void handleCopyTeamLink()}
				type="button"
			>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

export function TeamMembersCardGrid({
	canInviteTeamMembers,
	isInviteLinkPending,
	rows,
	teamInviteLink,
}: {
	canInviteTeamMembers: boolean;
	isInviteLinkPending: boolean;
	rows: TeamPageMemberRow[];
	teamInviteLink: string | null;
}) {
	return (
		<div className="team-lineup-surface-scope">
			<ul className="grid justify-center gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(233px,233px))]">
				{canInviteTeamMembers ? (
					<li className="list-none">
						<TeamCardShapePlaceholder
							isInviteLinkPending={isInviteLinkPending}
							teamInviteLink={teamInviteLink}
						/>
					</li>
				) : null}
				{rows.map((row) => {
					const teamCardPresentation = resolveTeamCardPresentation(row);

					return (
						<li key={row.userId} className="list-none">
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
						</li>
					);
				})}
			</ul>
		</div>
	);
}
