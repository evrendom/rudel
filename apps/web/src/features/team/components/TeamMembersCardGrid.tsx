import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import type { TeamCardTone } from "@/features/team/data/team-card-types";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { cn } from "@/lib/utils";

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 1,
	notation: "compact",
	style: "currency",
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

const adaptedTeamCardShellClassName =
	"team-lineup-featured-card relative isolate flex h-[358px] w-[233px] flex-col overflow-hidden rounded-[18px] border border-[#ECECEC] bg-[linear-gradient(180deg,#fbfcfe_0%,#f0f3f7_100%)] px-[14px] pt-[15px] pb-[10px] text-[#302d2b] shadow-[0_0_10.1px_rgba(0,0,0,0.08)]";

const adaptedTeamCardHeaderValueClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] text-[17.07px] font-extrabold leading-none tracking-[-0.01em] tabular-nums text-[#272423]";

const adaptedTeamCardHeaderLabelClassName =
	"ml-[5px] text-[10px] font-semibold leading-none tracking-[-0.03em] text-[#7b7671]";

const adaptedTeamCardNameClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] text-[19px] font-extrabold leading-[0.9] tracking-[-0.02em] text-[#252220]";

const adaptedTeamCardModelSlotClassName =
	"flex flex-1 items-center justify-center";

const adaptedTeamCardMediaPanelClassName =
	"team-lineup-featured-media-panel mt-[12px] h-[158px] w-full rounded-[14px] border border-black/8 bg-white/86";

const portraitPanelClassName =
	"relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[10px] px-[12px] py-[10px]";

const portraitPlaceholderInitialsClassName =
	"text-[54px] font-extrabold leading-none tracking-[-0.08em] text-black/66";

const tonePortraitClassNames = {
	blue: "bg-[linear-gradient(180deg,#d8e8ff_0%,#8fb7ec_100%)] text-[#24466d]",
	teal: "bg-[linear-gradient(180deg,#d7f6ef_0%,#87d8c7_100%)] text-[#174f48]",
	orange: "bg-[linear-gradient(180deg,#ffe8d5_0%,#f2b780_100%)] text-[#6f3c11]",
	lime: "bg-[linear-gradient(180deg,#ecf7d0_0%,#b6db72_100%)] text-[#475d1d]",
	violet: "bg-[linear-gradient(180deg,#ece8ff_0%,#c3b2f5_100%)] text-[#4c3977]",
	rose: "bg-[linear-gradient(180deg,#ffe5ea_0%,#ec9eb0_100%)] text-[#71364d]",
	slate: "bg-[linear-gradient(180deg,#e7edf2_0%,#bcc7d4_100%)] text-[#43515f]",
} as const satisfies Record<TeamCardTone, string>;

type TeamCardStatRow = {
	label: string;
	title?: string;
	value: string;
};

function getAvatarInitials(name: string) {
	const parts = name.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "TM";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "TM";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
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

function formatTotalTokens(totalTokens: number) {
	const normalizedTotal = Math.max(0, totalTokens);

	if (normalizedTotal >= 1_000_000) {
		const value = Math.ceil(normalizedTotal / 100_000) / 10;
		return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}M`;
	}

	if (normalizedTotal >= 1_000) {
		const value = Math.ceil(normalizedTotal / 100) / 10;
		return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}K`;
	}

	return `${Math.ceil(normalizedTotal)}`;
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

function formatInputOutputSplit(inputTokens: number, outputTokens: number) {
	const totalTokens = inputTokens + outputTokens;

	if (totalTokens <= 0) {
		return "0/0";
	}

	const inputShare = Math.round((inputTokens / totalTokens) * 100);
	const outputShare = 100 - inputShare;

	return `${inputShare}/${outputShare}`;
}

function getCardTone(row: TeamPageMemberRow): TeamCardTone {
	if (!row.hasActivity) {
		return "slate";
	}

	const favoriteModel = row.favoriteModel?.toLowerCase() ?? "";

	if (favoriteModel.includes("opus")) {
		return "orange";
	}

	if (
		favoriteModel.includes("claude") ||
		favoriteModel.includes("sonnet") ||
		favoriteModel.includes("haiku")
	) {
		return "teal";
	}

	if (favoriteModel.includes("gpt") || favoriteModel.includes("codex")) {
		return "blue";
	}

	return "rose";
}

function buildCardStats(row: TeamPageMemberRow): TeamCardStatRow[] {
	return [
		{
			label: "SESS",
			title: `${row.totalSessions.toLocaleString()} sessions`,
			value: row.totalSessions.toLocaleString(),
		},
		{
			label: "TOK",
			title:
				row.totalTokens > 0
					? `${row.totalTokens.toLocaleString()} total tokens`
					: "No traced tokens yet.",
			value: formatTotalTokens(row.totalTokens),
		},
		{
			label: "LAST",
			title: row.lastActiveDate ?? "No recent activity",
			value: formatShortDate(row.lastActiveDate),
		},
		{
			label: "IN/OUT",
			title: `${row.inputTokens.toLocaleString()} input tokens / ${row.outputTokens.toLocaleString()} output tokens`,
			value: formatInputOutputSplit(row.inputTokens, row.outputTokens),
		},
	];
}

function TeamMemberCard({ row }: { row: TeamPageMemberRow }) {
	const tone = getCardTone(row);
	const isMissingProfileImage = !row.imageUrl;
	const effectiveTone = isMissingProfileImage ? "rose" : tone;
	const stats = buildCardStats(row);
	const initials = getAvatarInitials(row.displayName);
	const topHeaderValue = formatSpendValue(row.cost);

	return (
		<li className="list-none">
			<article className={adaptedTeamCardShellClassName}>
				<div className="flex items-center">
					<div
						className="flex items-center"
						title={`${currencyFormatter.format(row.cost)} estimated spend`}
					>
						<div className={adaptedTeamCardHeaderValueClassName}>
							{topHeaderValue}
						</div>
						<div className={adaptedTeamCardHeaderLabelClassName}>COST</div>
					</div>
				</div>

				<div className={adaptedTeamCardMediaPanelClassName}>
					<div
						className={cn(
							portraitPanelClassName,
							tonePortraitClassNames[effectiveTone],
						)}
					>
						{row.imageUrl ? (
							<>
								<img
									src={row.imageUrl}
									alt={row.displayName}
									className="absolute inset-0 h-full w-full object-cover object-center"
								/>
								<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_34%,rgba(0,0,0,0.18)_100%)]" />
								<div className="relative z-10 flex-1" />
							</>
						) : (
							<div className="flex h-full w-full items-center justify-center">
								<div className={portraitPlaceholderInitialsClassName}>
									{initials}
								</div>
							</div>
						)}
					</div>
				</div>

				<div className="mt-[16px] flex flex-1 flex-col px-[3px] text-center">
					<div className={adaptedTeamCardNameClassName}>{row.displayName}</div>
					<div className={adaptedTeamCardModelSlotClassName}>
						{row.favoriteModel ? (
							<div className="flex max-w-full justify-center">
								<DashboardModelBadges models={[row.favoriteModel]} />
							</div>
						) : null}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-[6px] [font-family:var(--dashboard-01-font-roster-mono)] text-[11px] font-normal text-[#4b4d49]">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className="grid min-h-[32px] min-w-0 grid-cols-[auto_max-content] items-center justify-center gap-[6px] rounded-[10px] border border-black/8 bg-white/74 px-[8px] py-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
							title={stat.title}
						>
							<div className="shrink-0 leading-none tracking-[0.08em] text-black/42">
								{stat.label}
							</div>
							<div className="leading-none tracking-[-0.04em] tabular-nums text-[#272423]">
								{stat.value}
							</div>
						</div>
					))}
				</div>
			</article>
		</li>
	);
}

export function TeamMembersCardGrid({ rows }: { rows: TeamPageMemberRow[] }) {
	return (
		<div className="team-lineup-surface-scope">
			<ul className="grid justify-center gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(233px,233px))]">
				{rows.map((row) => (
					<TeamMemberCard key={row.userId} row={row} />
				))}
			</ul>
		</div>
	);
}
