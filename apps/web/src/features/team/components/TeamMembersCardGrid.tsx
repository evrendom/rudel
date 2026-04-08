import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import type { TeamCardTone } from "@/features/team/data/team-card-types";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { cn } from "@/lib/utils";

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

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
	"ml-[5px] text-[10px] font-semibold leading-none tracking-[-0.03em]";

const adaptedTeamCardRoleClassName =
	"text-[12.36px] font-medium leading-none text-[#5d5955]";

const adaptedTeamCardNameClassName =
	"[font-family:var(--dashboard-01-font-roster-display)] text-[19px] font-extrabold leading-[0.9] tracking-[-0.02em] text-[#252220]";

const adaptedTeamCardModelSlotClassName =
	"mt-[8px] flex min-h-[22px] items-center justify-center";

const adaptedTeamCardMediaPanelClassName =
	"team-lineup-featured-media-panel mt-[12px] h-[158px] w-full rounded-[14px] border border-black/8 bg-white/86";

const portraitPanelClassName =
	"relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[10px] px-[12px] py-[10px]";

const portraitPlaceholderInitialsClassName =
	"text-[54px] font-extrabold leading-none tracking-[-0.08em] text-black/66";

const toneAccentClassNames = {
	blue: "text-[#295ea8]",
	teal: "text-[#187d71]",
	orange: "text-[#bf6419]",
	lime: "text-[#5f8f1d]",
	violet: "text-[#7352d5]",
	rose: "text-[#c24d70]",
	slate: "text-[#5e6978]",
} as const satisfies Record<TeamCardTone, string>;

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

type TeamCardTag = {
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

function formatTopSkill(
	row: Pick<TeamPageMemberRow, "topSkills" | "totalSessions">,
) {
	const topSkill = [...row.topSkills]
		.filter((skill) => skill.name.trim().length > 0)
		.sort(
			(leftSkill, rightSkill) =>
				rightSkill.count - leftSkill.count ||
				leftSkill.name.localeCompare(rightSkill.name),
		)[0];

	if (topSkill) {
		const normalizedName =
			topSkill.name.split("/").at(-1)?.trim() ?? topSkill.name.trim();

		return {
			count: topSkill.count,
			title: `${topSkill.name} ×${topSkill.count}`,
			value: normalizedName
				.replaceAll(/[-_]+/g, " ")
				.replaceAll(/\s+/g, " ")
				.trim()
				.replaceAll(/\b\w/g, (character) => character.toUpperCase()),
		} as const;
	}

	return null;
}

function getTopSkillTag(
	row: Pick<TeamPageMemberRow, "topSkills" | "totalSessions">,
): TeamCardTag | null {
	const topSkill = formatTopSkill(row);

	if (topSkill && topSkill.count > 0) {
		return {
			title: topSkill.title,
			value: topSkill.value,
		};
	}

	return null;
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

function formatAverageTokens(totalTokens: number, totalSessions: number) {
	if (totalSessions <= 0) {
		return "0";
	}

	return compactNumberFormatter.format(totalTokens / totalSessions);
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

	if (row.totalSessions > 0 && row.topSkills.length === 0) {
		return "rose";
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
			label: "DAYS",
			title: `${row.activeDays.toLocaleString()} active days`,
			value: row.activeDays.toLocaleString(),
		},
		{
			label: "AVG",
			title:
				row.totalSessions > 0
					? `${Math.round(row.totalTokens / row.totalSessions).toLocaleString()} average tokens per session`
					: "No traced sessions yet.",
			value: formatAverageTokens(row.totalTokens, row.totalSessions),
		},
		{
			label: "LAST",
			title: row.lastActiveDate ?? "No recent activity",
			value: formatShortDate(row.lastActiveDate),
		},
		{
			label: "COST",
			title: `${currencyFormatter.format(row.cost)} estimated spend`,
			value: formatSpendValue(row.cost),
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
	const stats = buildCardStats(row);
	const initials = getAvatarInitials(row.displayName);
	const topHeaderValue = formatSpendValue(row.cost);
	const topSkillTag = getTopSkillTag(row);

	return (
		<li className="list-none">
			<article className={adaptedTeamCardShellClassName}>
				<div className="flex items-center justify-between">
					<div
						className="flex items-center"
						title={`${currencyFormatter.format(row.cost)} estimated spend`}
					>
						<div className={adaptedTeamCardHeaderValueClassName}>
							{topHeaderValue}
						</div>
						<div
							className={cn(
								adaptedTeamCardHeaderLabelClassName,
								toneAccentClassNames[tone],
							)}
						>
							SPEND
						</div>
					</div>
					<div className={adaptedTeamCardRoleClassName}>{row.role}</div>
				</div>

				<div className={adaptedTeamCardMediaPanelClassName}>
					<div
						className={cn(portraitPanelClassName, tonePortraitClassNames[tone])}
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

						{topSkillTag ? (
							<div
								className={cn(
									"absolute right-[10px] bottom-[10px] z-10 max-w-[108px] truncate rounded-full border border-black/10 bg-white/72 px-[10px] py-[4px] text-[10px] font-semibold uppercase tracking-[0.12em] text-black/72 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] backdrop-blur-[6px]",
									toneAccentClassNames[tone],
								)}
								title={topSkillTag.title}
							>
								{topSkillTag.value}
							</div>
						) : null}
					</div>
				</div>

				<div className="mt-[16px] px-[3px] text-center">
					<div className={adaptedTeamCardNameClassName}>{row.displayName}</div>
					<div className={adaptedTeamCardModelSlotClassName}>
						{row.favoriteModel ? (
							<div className="flex max-w-full justify-center">
								<DashboardModelBadges models={[row.favoriteModel]} />
							</div>
						) : null}
					</div>
				</div>

				<div className="mt-auto grid grid-cols-3 gap-[6px] [font-family:var(--dashboard-01-font-roster-mono)] text-[11px] font-normal text-[#4b4d49]">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className="min-w-0 rounded-[10px] border border-black/8 bg-white/74 px-[8px] py-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
							title={stat.title}
						>
							<div className="truncate leading-none tracking-[-0.02em] tabular-nums text-[#272423]">
								{stat.value}
							</div>
							<div className="mt-[4px] shrink-0 leading-none tracking-[0.08em] text-black/42">
								{stat.label}
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
